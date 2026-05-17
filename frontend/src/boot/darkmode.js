import { Dark, setCssVar } from 'quasar'

const LIGHT_PRIMARY = '#3c4759'
const DARK_PRIMARY = '#a5b4fc'

function updateDarkMode(dark = null) {
  let darkmode = !!localStorage.getItem('darkmodeEnabled') || false

  if (dark !== null) {
    darkmode = dark
  }

  Dark.set(darkmode)
  setCssVar('primary', darkmode ? DARK_PRIMARY : LIGHT_PRIMARY)

  if (darkmode) {
    localStorage.setItem('darkmodeEnabled', 'y')
  } else {
    localStorage.removeItem('darkmodeEnabled')
  }
}

// Update as soon as loading
updateDarkMode()

export default ({ app }) => {
  // Define global properties
  app.config.globalProperties.$toggleDarkMode = () => {
    updateDarkMode(!Dark.isActive)
  }

  app.config.globalProperties.$updateDarkMode = updateDarkMode
}

export { updateDarkMode }
