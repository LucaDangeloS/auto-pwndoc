<template>
  <div id="q-app">
    <router-view />
  </div>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'App',

  mounted() {
    document.addEventListener('keydown', this.handleEscapeKey, false);
  },

  beforeUnmount() {
    document.removeEventListener('keydown', this.handleEscapeKey, false);
  },

  methods: {
    handleEscapeKey(event) {
      if (event.key !== 'Escape' && event.key !== 'Esc') return;
      if (this.closeTopDialog()) {
        event.preventDefault();
        return;
      }
      if (this.leaveSecondaryPage()) event.preventDefault();
    },

    closeTopDialog() {
      if (document.querySelector('.q-menu:not(.q-menu--hidden)')) return false;

      const dialogs = Array.from(document.querySelectorAll('.q-dialog'));
      const dialog = dialogs.reverse().find((element) => {
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      if (!dialog) return false;

      const closeButton = Array.from(dialog.querySelectorAll('.q-bar button')).find((button) => {
        const text = (button.textContent || '').trim().toLowerCase();
        const aria = (button.getAttribute('aria-label') || '').trim().toLowerCase();
        const title = (button.getAttribute('title') || '').trim().toLowerCase();
        return text === 'close' || aria === 'close' || title === 'close';
      });
      if (!closeButton) return false;

      closeButton.click();
      return true;
    },

    leaveSecondaryPage() {
      const route = this.$route;
      if (!route || !route.params || !route.params.auditId) return false;
      if (!['addFindings', 'editFinding', 'editSection'].includes(route.name)) return false;

      this.$router.push(`/audits/${route.params.auditId}/general`).catch(() => {});
      return true;
    },
  },
});
</script>

<style>
</style>
