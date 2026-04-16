<template>
    <q-card flat class="row card-breadcrumb">
        <span v-if="typeof(title) === 'undefined'" class="breadcrumb-title">{{bread[last].name}}</span>
        <div v-else-if="$settings.reviews.enabled && state !== 'EDIT'" class="breadcrumb-title">
            <span class="text-bold">{{title}}</span> 
            <audit-state-icon class="q-mx-sm" :approvals="approvals" :state="state"/>
        </div>
        <div v-else class="q-mt-md">
            <span class="text-bold">{{title}}</span> 
        </div>
        <q-space />
        <q-breadcrumbs v-if="typeof(buttons) === 'undefined'" separator="/" active-color="secondary" color="light" align="right">
            <q-breadcrumbs-el v-for="breadcrumb in bread" :label="breadcrumb.name" :to="breadcrumb.path" :key="breadcrumb.path" />
        </q-breadcrumbs>
        <div v-else class="breadcrumb-buttons">
            <slot name="buttons"></slot>
        </div>
    </q-card>
</template>

<script>
import { defineComponent } from 'vue';

import AuditStateIcon from 'components/audit-state-icon';

export default defineComponent({
  name: 'breadcrumb',
  props: ['buttons', 'title', 'approvals', 'state'],

  components: {
      AuditStateIcon
  },

  data: function() {
      return {
          bread: [],
          last: 0
      }
  },

  created: function() {
      this.initBreadcrumb();
  },

  methods: {
      initBreadcrumb: function() {
          var breadArray = this.$route.matched;
          breadArray.forEach((element) => {
              var entry = {};
              if (element.meta.breadcrumb) {
                  entry.name = element.meta.breadcrumb;
                  entry.path = (element.path === "") ? "/" : element.path;
                  this.bread.push(entry);
              }
          });
          this.last = this.bread.length - 1;
      }
  },
});
</script>

<style lang="stylus" scoped>
.card-breadcrumb {
    min-height: 50px
    padding: 6px 16px
    margin: 8px 12px 8px 12px
    align-items: center
    flex-wrap: wrap
    gap: 6px
}

.breadcrumb-title {
    margin-top: 0
}

.breadcrumb-buttons {
    margin-top: 0
}

.card-breadcrumb>.q-breadcrumbs {
    margin-top: 0
}

.approvedMark {
    margin-left: 10px;
    font-size: 1.25em!important;
}
</style>