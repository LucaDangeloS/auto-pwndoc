function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()
}

function relevance(label, query) {
  const value = normalize(label)
  if (!value.includes(query)) return -1
  if (value === query) return 0
  if (value.startsWith(query)) return 1
  if (value.split(/\s+/).some(word => word.startsWith(query))) return 2
  return 3
}

export function rankSearchResults(options, query, getLabels = option => option) {
  const needle = normalize(query)
  if (!needle) return options
  return options
    .map((option, index) => {
      const optionLabels = getLabels(option)
      const labels = (Array.isArray(optionLabels) ? optionLabels : [optionLabels])
        .map(label => relevance(label, needle))
        .filter(score => score >= 0)
      return { option, index, score: labels.length ? Math.min(...labels) : -1 }
    })
    .filter(item => item.score >= 0)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(item => item.option)
}
