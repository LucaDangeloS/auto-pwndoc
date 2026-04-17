import { boot } from 'quasar/wrappers'
import { Notify } from 'quasar'

// Push toasts below the top navbar (~50px) and below the breadcrumb/action
// button row (~60px) so notifications never block UI controls.
export default boot(() => {
  Notify.setDefaults({
    position: 'top-right',
    offset: [10, 70]
  })
})
