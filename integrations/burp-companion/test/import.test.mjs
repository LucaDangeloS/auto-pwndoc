import test from 'node:test'
import assert from 'node:assert/strict'
import {endpoint, mapIssue, parseArgs, parseIssues, run} from '../src/import.mjs'

const issue = (host = 'app.example.test') => ({name: 'Reflected input', detail: '<p>Parameter q reflected</p>',
  baseUrl: `https://${host}/search?q=1`, severity: 'HIGH', confidence: 'CERTAIN',
  definition: {id: 'Reflected input', typeIndex: 1234},
  requestResponses: [{request: 'GET /search?q=1 HTTP/1.1\r\nAuthorization: Bearer secret\r\nCookie: sid=secret',
    response: 'HTTP/1.1 200 OK\r\nSet-Cookie: sid=secret'}]})

test('validates endpoints and explicit target allowlist', () => {
  assert.equal(endpoint('http://127.0.0.1:9876', true).hostname, '127.0.0.1')
  assert.throws(() => endpoint('http://burp.example.test:9876', true))
  assert.throws(() => endpoint('http://pwndoc.example.test'))
  assert.throws(() => parseArgs(['--audit', '507f1f77bcf86cd799439011']))
  assert.equal(parseArgs(['--audit', '507f1f77bcf86cd799439011', '--allow-host', 'app.example.test']).allowHosts[0], 'app.example.test')
})

test('maps scanner issues without sending HTTP secrets by default', () => {
  const candidate = mapIssue(issue())
  assert.equal(candidate.sourceType, 'burp')
  assert.equal(candidate.target, 'https://app.example.test/search?q=1')
  assert.equal(candidate.sourceId, mapIssue(issue()).sourceId)
  assert.doesNotMatch(candidate.rawEvidence, /secret/)
  const withHttp = mapIssue(issue(), true)
  assert.match(withHttp.rawEvidence, /Request:/)
  assert.doesNotMatch(withHttp.rawEvidence, /secret/)
  assert.equal(parseIssues({content: [{type: 'text', text: `${JSON.stringify(issue())}\n\n${JSON.stringify(issue('other.test'))}`}]}).length, 2)
  assert.deepEqual(parseIssues({content: [{type: 'text', text: 'Reached end of items'}]}), [])
})

test('imports only in-scope issues through the evidence API and supports dry run', async () => {
  const originalFetch = globalThis.fetch
  const posts = []
  globalThis.fetch = async (url, init) => {
    assert.equal(init.headers['X-API-Key'], 'test-key')
    if (String(url).endsWith('/network')) return new Response(JSON.stringify({datas: {scope: [{hosts: [{hostname: 'app.example.test'}]}]}}), {status: 200})
    if (init.method === 'POST') { posts.push(JSON.parse(init.body)); return new Response(JSON.stringify({datas: {_id: 'candidate'}}), {status: 201}) }
    throw new Error('Unexpected API call')
  }
  const called = []
  const connect = async () => ({
    listTools: async () => ({tools: [{name: 'get_scanner_issues'}, {name: 'send_http1_request'}]}),
    callTool: async args => { called.push(args.name); return {content: [{type: 'text', text: [issue(), issue('outside.test')].map(JSON.stringify).join('\n\n')}] } },
    close: async () => {}
  })
  const options = parseArgs(['--audit', '507f1f77bcf86cd799439011', '--allow-host', 'app.example.test', '--limit', '2'])
  try {
    const result = await run(options, 'test-key', connect)
    assert.deepEqual(result, {read: 2, inScope: 1, created: 1, duplicates: 0, skipped: 1})
    assert.deepEqual(called, ['get_scanner_issues'])
    assert.equal(posts[0].sourceType, 'burp')
    options.dryRun = true
    await run(options, 'test-key', connect)
    assert.equal(posts.length, 1)
  } finally { globalThis.fetch = originalFetch }
})
