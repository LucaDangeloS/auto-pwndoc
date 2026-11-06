<template>
<div class="row q-col-gutter-sm taxonomy-picker">
  <div class="col-md-6 col-12">
    <q-select
      outlined dense
      :label="$t('type')"
      :model-value="current.type || null"
      @update:model-value="onTypeChange"
      :options="typeOptions"
      use-input input-debounce="0"
      @filter="(value, update) => filterOptions('type', value, update)"
      new-value-mode="add-unique"
      clearable
      options-sanitize
      :disable="readonly"
    />
  </div>
  <div class="col-md-6 col-12">
    <q-select
      outlined dense
      :label="$t('category')"
      :model-value="current.category || null"
      @update:model-value="onCategoryChange"
      :options="categoryOptions"
      use-input input-debounce="0"
      @filter="(value, update) => filterOptions('category', value, update)"
      new-value-mode="add-unique"
      clearable
      options-sanitize
      :disable="readonly || !current.type"
    />
  </div>
  <div class="col-md-6 col-12">
    <q-select
      outlined dense
      :label="$t('subcategory')"
      :model-value="current.subcategory || null"
      @update:model-value="onSubcategoryChange"
      :options="subcategoryOptions"
      use-input input-debounce="0"
      @filter="(value, update) => filterOptions('subcategory', value, update)"
      new-value-mode="add-unique"
      clearable
      options-sanitize
      :disable="readonly || !current.category"
    />
  </div>
  <div class="col-md-6 col-12">
    <q-select
      outlined dense
      :label="$t('code')"
      :model-value="current.code || null"
      @update:model-value="onCodeChange"
      :options="codeOptions"
      use-input input-debounce="0"
      @filter="(value, update) => filterOptions('code', value, update)"
      new-value-mode="add-unique"
      clearable
      options-sanitize
      :disable="readonly || !current.type"
    />
  </div>
</div>
</template>

<script>
import { defineComponent } from 'vue';
import DataService from '@/services/data';
import { rankSearchResults } from '@/services/search-ranking';

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
      taxonomy: [],
      searchTerms: { type: '', category: '', subcategory: '', code: '' }
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
      return rankSearchResults(Array.from(new Set(this.taxonomy.map(r => r.type))).filter(Boolean).sort(), this.searchTerms.type);
    },
    categoryOptions() {
      if (!this.current.type) return [];
      return rankSearchResults(Array.from(new Set(
        this.taxonomy.filter(r => r.type === this.current.type && r.category).map(r => r.category)
      )).sort(), this.searchTerms.category);
    },
    subcategoryOptions() {
      if (!this.current.type || !this.current.category) return [];
      return rankSearchResults(Array.from(new Set(
        this.taxonomy
          .filter(r => r.type === this.current.type && r.category === this.current.category && r.subcategory)
          .map(r => r.subcategory)
      )).sort(), this.searchTerms.subcategory);
    },
    codeOptions() {
      if (!this.current.type) return [];
      return rankSearchResults(Array.from(new Set(
        this.taxonomy
          .filter(r =>
            r.type === this.current.type &&
            (r.category || '') === this.current.category &&
            (r.subcategory || '') === this.current.subcategory &&
            r.code
          )
          .map(r => r.code)
      )).sort(), this.searchTerms.code);
    }
  },

  mounted() {
    this.loadTaxonomy();
  },

  methods: {
    filterOptions(field, value, update) {
      update(() => { this.searchTerms[field] = value || ''; });
    },
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

    // Persist a new (type, category, subcategory) path to the taxonomy
    // collection if it doesn't already exist there.
    maybeCreateTaxonomyEntry(next) {
      if (!next.type) return;
      const exists = this.taxonomy.some(r =>
        r.type === next.type &&
        (r.category || '') === (next.category || '') &&
        (r.subcategory || '') === (next.subcategory || '')
      );
      if (exists) return;
      DataService.createVulnerabilityTaxonomy({
        type: next.type,
        category: next.category || '',
        subcategory: next.subcategory || '',
        code: next.code || ''
      })
      .then(res => {
        const created = res.data && res.data.datas;
        if (created) this.taxonomy.push(created);
      })
      .catch(err => {
        if (!err.response || err.response.status !== 409) {
          console.error('taxonomy create failed', err);
        }
      });
    },

    onTypeChange(val) {
      const next = { type: val || '', category: '', subcategory: '', code: this.current.code };
      this.emitNext(next);
      this.tryAutofillCode(next);
      if (val) this.maybeCreateTaxonomyEntry(next);
    },

    onCategoryChange(val) {
      const next = { type: this.current.type, category: val || '', subcategory: '', code: this.current.code };
      this.emitNext(next);
      this.tryAutofillCode(next);
      if (val) this.maybeCreateTaxonomyEntry(next);
    },

    onSubcategoryChange(val) {
      const next = { type: this.current.type, category: this.current.category, subcategory: val || '', code: this.current.code };
      this.emitNext(next);
      this.tryAutofillCode(next);
      if (val) this.maybeCreateTaxonomyEntry(next);
    },

    onCodeChange(val) {
      const next = { ...this.current, code: val || '' };
      this.emitNext(next);
      if (val) this.maybeCreateTaxonomyEntry(next);
    },

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
