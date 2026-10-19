import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { Client, SSEClientTransport } from '@modelcontextprotocol/client'

const allowedLocal = new Set(['localhost', '127.0.0.1', '[::1]'])
const END = 'Reached end of items'

export function endpoint(value, localOnly = false) {
  const url = new URL(value)
  if (url.username || url.password || url.search || url.hash) throw new Error('Endpoint URL must not contain credentials or query parameters')
  if (localOnly && (url.protocol !== 'http:' || !allowedLocal.has(url.hostname)))
    throw new Error('Burp MCP URL must use HTTP on the local machine')
  if (!localOnly && url.protocol !== 'https:' && !(url.protocol === 'http:' && allowedLocal.has(url.hostname)))
    throw new Error('PwnDoc API must use HTTPS unless it is local')
  return url
}

export function parseIssues(result) {
  if (result.isError) throw new Error(result.content?.map(item => item.text).join(' ') || 'Burp MCP tool failed')
  const text = (result.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n').trim()
  if (!text || text === END) return []
  return text.split(/\n\s*\n/).map(part => {
    const issue = JSON.parse(part)
    if (!issue || typeof issue !== 'object' || !issue.name) throw new Error('Unexpected Burp issue payload')
    return issue
  })
}

function plain(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ').trim()
}

function hostOf(issue) {
  const raw = issue.baseUrl || (issue.httpService ? `${issue.httpService.secure ? 'https' : 'http'}://${issue.httpService.host}:${issue.httpService.port}` : '')
  if (!raw) throw new Error('Burp issue has no target URL')
  return new URL(raw)
}

function redactHttp(text) {
  return String(text || '').replace(/^(Authorization|Proxy-Authorization|Cookie|Set-Cookie):.*$/gim, '$1: [REDACTED]')
}

export function mapIssue(issue, includeHttp = false) {
  const target = hostOf(issue)
  const request = issue.requestResponses?.[0]?.request || ''
  const stable = [issue.name, target.href, issue.definition?.typeIndex || '', request.split(/\r?\n/)[0] || '', issue.detail || ''].join('\n')
  const sourceId = createHash('sha256').update(stable).digest('hex')
  const summary = [issue.severity, issue.confidence, plain(issue.detail)].filter(Boolean).join(' · ').slice(0, 10000)
  const parts = [plain(issue.remediation), issue.definition?.id ? `Burp type: ${issue.definition.id}` : ''].filter(Boolean)
  if (includeHttp) for (const item of (issue.requestResponses || []).slice(0, 2)) {
    parts.push(`Request:\n${redactHttp(item.request)}\nResponse:\n${redactHttp(item.response)}`)
  }
  return {sourceType: 'burp', sourceId, title: plain(issue.name).slice(0, 180), target: target.href.slice(0, 2048),
    summary, rawEvidence: parts.join('\n\n').slice(0, 100000), observedAt: new Date().toISOString()}
}

export function parseArgs(argv) {
  const options = {apiUrl: 'http://localhost:8080', mcpUrl: 'http://127.0.0.1:9876', limit: 200,
    allowHosts: [], dryRun: false, includeHttp: false}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--include-http') options.includeHttp = true
    else if (['--audit', '--api-url', '--mcp-url', '--limit', '--allow-host'].includes(arg)) {
      const value = argv[++i]
      if (!value) throw new Error(`${arg} requires a value`)
      if (arg === '--audit') options.auditId = value
      if (arg === '--api-url') options.apiUrl = value
      if (arg === '--mcp-url') options.mcpUrl = value
      if (arg === '--limit') options.limit = Number(value)
      if (arg === '--allow-host') options.allowHosts.push(value.toLowerCase())
    } else throw new Error(`Unknown option: ${arg}`)
  }
  if (!/^[0-9a-f]{24}$/i.test(options.auditId || '')) throw new Error('--audit must be a MongoDB audit ID')
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 500) throw new Error('--limit must be between 1 and 500')
  if (!options.allowHosts.length || options.allowHosts.some(host => !/^[a-z0-9.-]+$/.test(host)))
    throw new Error('Specify at least one --allow-host with a hostname or IP')
  endpoint(options.apiUrl)
  endpoint(options.mcpUrl, true)
  return options
}

async function api(apiUrl, path, key, method = 'GET', body) {
  const url = new URL(`/api/${path}`, apiUrl)
  const response = await fetch(url, {method, headers: {'X-API-Key': key, ...(body ? {'Content-Type': 'application/json'} : {})},
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000)})
  const result = await response.json().catch(() => ({}))
  return {status: response.status, value: result.datas}
}

export async function run(options, key, connect = async url => {
  const client = new Client({name: 'autopwndoc-burp-companion', version: '1.0.0'})
  await client.connect(new SSEClientTransport(url))
  return client
}) {
  if (!key) throw new Error('AUTOPWNDOC_API_KEY is required')
  const audit = await api(options.apiUrl, `audits/${options.auditId}/network`, key)
  if (audit.status !== 200) throw new Error(`Cannot read audit scope (HTTP ${audit.status})`)
  const scopedHosts = new Set((audit.value?.scope || []).flatMap(group => (group.hosts || [])
    .flatMap(host => [host.hostname, host.ip].filter(Boolean).map(value => value.toLowerCase()))))
  const allowedHosts = new Set(options.allowHosts)
  if (scopedHosts.size) for (const host of [...allowedHosts]) if (!scopedHosts.has(host)) allowedHosts.delete(host)
  if (!allowedHosts.size) throw new Error('No allowed host matches the audit scope')
  const client = await connect(endpoint(options.mcpUrl, true))
  const summary = {read: 0, inScope: 0, created: 0, duplicates: 0, skipped: 0}
  try {
    const tools = await client.listTools()
    if (!tools.tools?.some(tool => tool.name === 'get_scanner_issues'))
      throw new Error('Burp Professional get_scanner_issues tool is unavailable')
    for (let offset = 0; offset < options.limit; offset += 25) {
      const result = await client.callTool({name: 'get_scanner_issues', arguments: {count: Math.min(25, options.limit - offset), offset}})
      const issues = parseIssues(result)
      if (!issues.length) break
      summary.read += issues.length
      for (const issue of issues) {
        let candidate
        try { candidate = mapIssue(issue, options.includeHttp) } catch { summary.skipped++; continue }
        if (!allowedHosts.has(new URL(candidate.target).hostname.toLowerCase())) { summary.skipped++; continue }
        summary.inScope++
        if (options.dryRun) continue
        const response = await api(options.apiUrl, `audits/${options.auditId}/evidence`, key, 'POST', candidate)
        if (response.status === 201) summary.created++
        else if (response.status === 422 && String(response.value).includes('already exists')) summary.duplicates++
        else throw new Error(`Evidence import failed (HTTP ${response.status})`)
      }
      if (issues.length < Math.min(25, options.limit - offset)) break
    }
    return summary
  } finally { await client.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const summary = await run(options, process.env.AUTOPWNDOC_API_KEY)
    process.stdout.write(`${JSON.stringify(summary)}\n`)
  } catch (err) {
    process.stderr.write(`${err.message}\n`)
    process.exitCode = 1
  }
}
