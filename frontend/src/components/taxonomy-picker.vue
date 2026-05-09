<template>
<div class="row q-col-gutter-sm taxonomy-picker">
  <div class="col-md-3 col-12">
    <q-select
      outlined dense
      :label="$t('type')"
      :model-value="current.type || null"
      @update:model-value="onTypeChange"
      :options="typeOptions"
      use-input input-debounce="0"
      new-value-mode="add-unique"
      clearable
      options-sanitize
      :disable="readonly"
    />
  </div>
  <div class="col-md-3 col-12">
    <q-select
      outlined dense
      :label="$t('category')"
      :model-value="current.category || null"
      @update:model-value="onCategoryChange"
      :options="categoryOptions"
      use-input input-debounce="0"
      new-value-mode="add-unique"
      clearable
      options-sanitize
      :disable="readonly || !current.type"
    />
  </div>
  <div class="col-md-3 col-12">
    <q-select
      outlined dense
      :label="$t('subcategory')"
      :model-value="current.subcategory || null"
      @update:model-value="onSubcategoryChange"
      :options="subcategoryOptions"
      use-input input-debounce="0"
      new-value-mode="add-unique"
      clearable
      options-sanitize
      :disable="readonly || !current.category"
    />
  </div>
  <div class="col-md-3 col-12">
    <q-input
      outlined dense
      :label="$t('code')"
      :model-value="current.code"
      @update:model-value="onCodeChange"
      :readonly="readonly"
    />
  </div>
</div>
</template>

<script>
import { defineComponent } from 'vue';
import DataService from '@/services/data';

const EMPTY = { type: '', category: '', subcategory: '', code: '' };

export default defineComponent({
  name: 'taxonomy-picker',
  emits: ['update:modelValue'],

  props: {
    modelValue: { type: Array, default: () => [] },
    readonly: { type: Boolean, default: false }
  },

  data() {
    return {
      taxonomy: []
    };
  },

  computed: {
    current() {
      const v = (this.modelValue && this.modelValue[0]) || EMPTY;
      return {
        type: v.type || '',
        category: v.category || '',
        subcategory: v.subcategory || '',
        code: v.code || ''
      };
    },
    typeOptions() {
      return Array.from(new Set(this.taxonomy.map(r => r.type))).filter(Boolean).sort();
    },
    categoryOptions() {
      if (!this.current.type) return [];
      return Array.from(new Set(
        this.taxonomy.filter(r => r.type === this.current.type && r.category).map(r => r.category)
      )).sort();
    },
    subcategoryOptions() {
      if (!this.current.type || !this.current.category) return [];
      return Array.from(new Set(
        this.taxonomy
          .filter(r => r.type === this.current.type && r.category === this.current.category && r.subcategory)
          .map(r => r.subcategory)
      )).sort();
    }
  },

  mounted() {
    this.loadTaxonomy();
  },

  methods: {
    loadTaxonomy() {
      DataService.getVulnerabilityTaxonomy()
        .then(res => { this.taxonomy = res.data.datas || []; })
        .catch(err => { console.error('taxonomy load failed', err); });
    },

    emitNext(next) {
      const t = {
        type: next.type || '',
        category: next.category || '',
        subcategory: next.subcategory || '',
        code: next.code || ''
      };
      if (!t.type && !t.category && !t.subcategory && !t.code) {
        this.$emit('update:modelValue', []);
      } else {
        this.$emit('update:modelValue', [t]);
      }
    },

    onTypeChange(val) {
      // Clearing type also clears its descendants.
      const next = { type: val || '', category: '', subcategory: '', code: this.current.code };
      this.emitNext(next);
      this.tryAutofillCode(next);
    },

    onCategoryChange(val) {
      const next = { type: this.current.type, category: val || '', subcategory: '', code: this.current.code };
      this.emitNext(next);
      this.tryAutofillCode(next);
    },

    onSubcategoryChange(val) {
      const next = { type: this.current.type, category: this.current.category, subcategory: val || '', code: this.current.code };
      this.emitNext(next);
      this.tryAutofillCode(next);
    },

    onCodeChange(val) {
      this.emitNext({ ...this.current, code: val || '' });
    },

    // When the user picks a triple that resolves to a single taxonomy row
    // and that row carries a `code`, fill it in automatically — but only
    // if the user hasn't typed a code themselves.
    tryAutofillCode(picked) {
      if (this.current.code) return;
      const match = this.taxonomy.find(r =>
        r.type === picked.type &&
        (r.category || '') === picked.category &&
        (r.subcategory || '') === picked.subcategory &&
        r.code
      );
      if (match) {
        this.emitNext({ ...picked, code: match.code });
      }
    }
  }
});
</script>

<style>
.taxonomy-picker { width: 100%; }
</style>
