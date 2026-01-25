<template>
    <div>
        <!-- Version Selector -->
        <q-card class="q-mb-sm">
            <q-card-section class="row items-center q-pb-sm">
                <q-select
                    v-model="cvssVersion"
                    :options="versionOptions"
                    option-label="label"
                    option-value="value"
                    emit-value
                    map-options
                    label="Version CVSS"
                    outlined
                    dense
                    style="min-width: 150px"
                    @update:model-value="onVersionChange"
                />

                <q-space />
            </q-card-section>
        </q-card>

        <!-- CVSS 3.1 Component -->
        <cvss-calculator 
            v-if="cvssVersion === '3.1'"
            :model-value="internalCvss3Vector"
            :readonly="readonly"
            @update:model-value="onCvss3Change"
        />

        <!-- CVSS 4.0 Component -->
        <q-card v-else-if="cvssVersion === '4.0'" class="cvsscalculator">
            <q-card-section class="row">
                <div class="col-md-3" style="align-self:center">
                    <span>
                        CVSS 4.0
                        <q-tooltip anchor="top middle" self="bottom middle" :delay="500" max-width="300px">
                            <span style="white-space: pre-wrap">Common Vulnerability Scoring System version 4.0</span>
                        </q-tooltip>
                    </span>
                </div>
                <q-space />
                <div v-if="cvss40.exploitability && cvss40.vulnerableSystemImpact" style="margin-right:120px">
                    <q-chip square color="blue-12" text-color="white">Exploitability:&nbsp;<span class="text-bold">{{roundUp1(cvss40.exploitability)}}</span></q-chip>
                    <q-chip square color="blue-12" text-color="white">Impact:&nbsp;<span class="text-bold">{{roundUp1(cvss40.vulnerableSystemImpact)}}</span></q-chip>
                </div>
                <div class="scoreRating" :class="cvss40.baseSeverity">
                    <span class="baseSeverity" v-if="!cvss40.baseMetricScore">{{$t('cvss4.selectMetrics')}}</span>
                    <div v-else>
                        <span class="baseMetricScore">{{cvss40.baseMetricScore}}</span>
                        <span class="baseSeverity">({{cvss40.baseSeverity}})</span>
                    </div>
                </div>
            </q-card-section>
            <q-separator />
            
            <!-- Base Metrics CVSS 4.0 -->
            <q-card-section class="row q-col-gutter-md">
                <div class="col-md-6">
                    <!-- Attack Vector -->
                    <div class="q-my-sm text-weight-bold">
                        <span>{{$t('cvss.attackVector')}} (AV)</span>
                    </div>
                    <q-btn-toggle
                        class="group-btn"
                        v-model="cvss40Obj.AV"
                        toggle-color="grey-5"
                        toggle-text-color="black"
                        no-caps
                        :options="cvss40Items.AV || []"
                        :readonly="readonly"
                    />

                    <!-- Attack Complexity -->
                    <div class="q-my-sm text-weight-bold">
                        <span>{{$t('cvss.attackComplexity')}} (AC)</span>
                    </div>
                    <q-btn-toggle
                        class="group-btn"
                        v-model="cvss40Obj.AC"
                        toggle-color="grey-5"
                        toggle-text-color="black"
                        no-caps
                        :options="cvss40Items.AC || []"
                        :readonly="readonly"
                    />

                    <!-- Attack Requirements (NEW in 4.0) -->
                    <div class="q-my-sm text-weight-bold">
                        <span>{{$t('cvss4.attackRequirements')}} (AT)</span>
                    </div>
                    <q-btn-toggle
                        class="group-btn"
                        v-model="cvss40Obj.AT"
                        toggle-color="grey-5"
                        toggle-text-color="black"
                        no-caps
                        :options="cvss40Items.AT || []"
                        :readonly="readonly"
                    />

                    <!-- Privileges Required -->
                    <div class="q-my-sm text-weight-bold">
                        <span>{{$t('cvss.privilegesRequired')}} (PR)</span>
                    </div>
                    <q-btn-toggle
                        class="group-btn"
                        v-model="cvss40Obj.PR"
                        toggle-color="grey-5"
                        toggle-text-color="black"
                        no-caps
                        :options="cvss40Items.PR || []"
                        :readonly="readonly"
                    />

                    <!-- User Interaction (UPDATED in 4.0) -->
                    <div class="q-my-sm text-weight-bold">
                        <span>{{$t('cvss.userInteraction')}} (UI)</span>
                    </div>
                    <q-btn-toggle
                        class="group-btn"
                        v-model="cvss40Obj.UI"
                        toggle-color="grey-5"
                        toggle-text-color="black"
                        no-caps
                        :options="cvss40Items.UI || []"
                        :readonly="readonly"
                    />
                </div>
                
                <div class="col-md-6">
                    <!-- Vulnerable System Impact -->
                    <div class="text-h6 q-mb-md text-primary">{{$t('cvss4.vulnerableSystemImpact')}}</div>
                    
                    <div class="q-my-sm text-weight-bold">
                        <span>{{$t('cvss.confidentialityImpact')}} (VC)</span>
                    </div>
                    <q-btn-toggle
                        class="group-btn"
                        v-model="cvss40Obj.VC"
                        toggle-color="grey-5"
                        toggle-text-color="black"
                        no-caps
                        :options="cvss40Items.VC || []"
                        :readonly="readonly"
                    />

                    <div class="q-my-sm text-weight-bold">
                        <span>{{$t('cvss.integrityImpact')}} (VI)</span>
                    </div>
                    <q-btn-toggle
                        class="group-btn"
                        v-model="cvss40Obj.VI"
                        toggle-color="grey-5"
                        toggle-text-color="black"
                        no-caps
                        :options="cvss40Items.VI || []"
                        :readonly="readonly"
                    />

                    <div class="q-my-sm text-weight-bold">
                        <span>{{$t('cvss.availabilityImpact')}} (VA)</span>
                    </div>
                    <q-btn-toggle
                        class="group-btn"
                        v-model="cvss40Obj.VA"
                        toggle-color="grey-5"
                        toggle-text-color="black"
                        no-caps
                        :options="cvss40Items.VA || []"
                        :readonly="readonly"
                    />

                    <!-- Subsequent Systems Impact (NEW in 4.0) -->
                    <div class="text-h6 q-mb-md text-secondary q-mt-lg">
                        {{$t('cvss4.subsequentSystemImpact')}}
                    </div>
                    
                    <div class="q-my-sm text-weight-bold">
                        <span>{{$t('cvss.confidentialityImpact')}} (SC)</span>
                    </div>
                    <q-btn-toggle
                        class="group-btn"
                        v-model="cvss40Obj.SC"
                        toggle-color="grey-5"
                        toggle-text-color="black"
                        no-caps
                        :options="cvss40Items.SC || []"
                        :readonly="readonly"
                    />

                    <div class="q-my-sm text-weight-bold">
                        <span>{{$t('cvss.integrityImpact')}} (SI)</span>
                    </div>
                    <q-btn-toggle
                        class="group-btn"
                        v-model="cvss40Obj.SI"
                        toggle-color="grey-5"
                        toggle-text-color="black"
                        no-caps
                        :options="cvss40Items.SI || []"
                        :readonly="readonly"
                    />

                    <div class="q-my-sm text-weight-bold">
                        <span>{{$t('cvss.availabilityImpact')}} (SA)</span>
                    </div>
                    <q-btn-toggle
                        class="group-btn"
                        v-model="cvss40Obj.SA"
                        toggle-color="grey-5"
                        toggle-text-color="black"
                        no-caps
                        :options="cvss40Items.SA || []"
                        :readonly="readonly"
                    />
                </div>
            </q-card-section>

            <!-- Threat and Environmental Metrics for CVSS 4.0 -->
            <q-expansion-item 
                :default-opened="false"
                :label="$t('cvss4.threatAndEnvironmentalTitle')"
                header-class="bg-blue-grey-5 text-white" 
                expand-icon-class="text-white">
                
                <q-card-section class="row">
                    <div class="col-md-6">
                        <span class="text-h6">{{$t('cvss4.threatMetrics')}}</span>
                    </div>
                    <q-space />
                    <div class="scoreRating" :class="cvss40.threatSeverity">
                        <span class="baseSeverity" v-if="!cvss40.threatMetricScore">{{$t('cvss4.threatScore')}}</span>
                        <div v-else>
                            <span class="baseMetricScore">{{cvss40.threatMetricScore}}</span>
                            <span class="baseSeverity">({{cvss40.threatSeverity}})</span>
                        </div>
                    </div>
                </q-card-section>
                <q-separator />
                
                <q-card-section class="row q-col-gutter-md">
                    <div class="col">
                        <!-- Exploit Maturity -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss4.exploitMaturity')}} (E)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.E"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.E || []"
                            :readonly="readonly"
                        />
                    </div>
                </q-card-section>

                <q-separator />
                
                <!-- Environmental Section -->
                <q-card-section class="row">
                    <div class="col-md-3" style="align-self:center">
                        <span class="text-h6">{{$t('cvss4.environmentalMetrics')}}</span>
                    </div>
                    <q-space />
                    <div class="scoreRating" :class="cvss40.environmentalSeverity">
                        <span class="baseSeverity" v-if="!cvss40.environmentalMetricScore">{{$t('cvss4.environmentalScore')}}</span>
                        <div v-else>
                            <span class="baseMetricScore">{{cvss40.environmentalMetricScore}}</span>
                            <span class="baseSeverity">({{cvss40.environmentalSeverity}})</span>
                        </div>
                    </div>
                </q-card-section>
                <q-separator />
                
                <q-card-section class="row q-col-gutter-md">
                    <div class="col-md-6">
                        <!-- Requirements -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss.confidentialityRequirement')}} (CR)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.CR"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.CR || []"
                            :readonly="readonly"
                        />

                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss.integrityRequirement')}} (IR)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.IR"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.IR || []"
                            :readonly="readonly"
                        />

                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss.availabilityRequirement')}} (AR)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.AR"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.AR || []"
                            :readonly="readonly"
                        />
                    </div>
                    
                    <div class="col-md-6">
                        <!-- Modified Attack Vector -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss.modifiedAttackVector')}} (MAV)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.MAV"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.MAV || []"
                            :readonly="readonly"
                        />

                        <!-- Modified Attack Complexity -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss.modifiedAttackComplexity')}} (MAC)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.MAC"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.MAC || []"
                            :readonly="readonly"
                        />

                        <!-- Modified Attack Requirements -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss4.modifiedAttackRequirements')}} (MAT)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.MAT"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.MAT || []"
                            :readonly="readonly"
                        />
                    </div>
                </q-card-section>
                
                <q-separator />
                
                <!-- Additional Environmental Metrics -->
                <q-card-section class="row q-col-gutter-md">
                    <div class="col-md-6">
                        <!-- Modified Privileges Required -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss.modifiedPrivilegesRequired')}} (MPR)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.MPR"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.MPR || []"
                            :readonly="readonly"
                        />

                        <!-- Modified User Interaction -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss.modifiedUserInteraction')}} (MUI)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.MUI"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.MUI || []"
                            :readonly="readonly"
                        />

                        <!-- Modified Vulnerable System Confidentiality -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss4.modifiedVulnerableSystemConfidentiality')}} (MVC)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.MVC"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.MVC || []"
                            :readonly="readonly"
                        />

                        <!-- Modified Vulnerable System Integrity -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss4.modifiedVulnerableSystemIntegrity')}} (MVI)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.MVI"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.MVI || []"
                            :readonly="readonly"
                        />

                        <!-- Modified Vulnerable System Availability -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss4.modifiedVulnerableSystemAvailability')}} (MVA)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.MVA"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.MVA || []"
                            :readonly="readonly"
                        />
                    </div>
                    
                    <div class="col-md-6">
                        <!-- Modified Subsequent System Confidentiality -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss4.modifiedSubsequentSystemConfidentiality')}} (MSC)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.MSC"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.MSC || []"
                            :readonly="readonly"
                        />

                        <!-- Modified Subsequent System Integrity -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss4.modifiedSubsequentSystemIntegrity')}} (MSI)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.MSI"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.MSI || []"
                            :readonly="readonly"
                        />

                        <!-- Modified Subsequent System Availability -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss4.modifiedSubsequentSystemAvailability')}} (MSA)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.MSA"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.MSA || []"
                            :readonly="readonly"
                        />
                    </div>
                </q-card-section>
                
                <q-separator />
                
                <!-- Supplemental Metrics -->
                <q-card-section class="row">
                    <div class="col-md-3" style="align-self:center">
                        <span class="text-h6">{{$t('cvss4.supplementalMetrics')}}</span>
                    </div>
                    <q-space />
                </q-card-section>
                <q-separator />
                
                <q-card-section class="row q-col-gutter-md">
                    <div class="col-md-6">
                        <!-- Safety -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss4.safety')}} (S)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.S"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.S || []"
                            :readonly="readonly"
                        />

                        <!-- Automatable -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss4.automatable')}} (AU)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.AU"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.AU || []"
                            :readonly="readonly"
                        />

                        <!-- Recovery -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss4.recovery')}} (R)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.R"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.R || []"
                            :readonly="readonly"
                        />
                    </div>
                    
                    <div class="col-md-6">
                        <!-- Value Density -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss4.valueDensity')}} (V)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.V"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.V || []"
                            :readonly="readonly"
                        />

                        <!-- Response Effort -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss4.responseEffort')}} (RE)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.RE"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.RE || []"
                            :readonly="readonly"
                        />

                        <!-- Provider Urgency -->
                        <div class="q-my-sm text-weight-bold">
                            <span>{{$t('cvss4.providerUrgency')}} (U)</span>
                        </div>
                        <q-btn-toggle
                            class="group-btn"
                            v-model="cvss40Obj.U"
                            toggle-color="grey-5"
                            toggle-text-color="black"
                            no-caps
                            :options="cvss40Items.U || []"
                            :readonly="readonly"
                        />
                    </div>
                </q-card-section>
            </q-expansion-item>
        </q-card>
    </div>
</template>

<script>
import { defineComponent } from 'vue';
import CvssCalculator from './cvsscalculator.vue';
import SettingsService from '@/services/settings';

export default defineComponent({
  emits: ['update:modelValue', 'update:cvssv4Value'],
  name: 'cvss-calculator-unified',
  components: {
    CvssCalculator
  },
  props: {
    modelValue: {
      type: String,
      default: ''
    },
    cvssv4Value: {
      type: String,
      default: ''
    },
    readonly: {
      type: Boolean,
      default: false
    }
  },

  data() {
    return {
      cvssVersion: '4.0', // Temporairement défini à 4.0 pour tester
      versionOptions: [
        { label: 'CVSS 3.1', value: '3.1' },
        { label: 'CVSS 4.0', value: '4.0' }
      ],
      
      // Internal state for both versions
      internalCvss3Vector: '',
      internalCvss4Vector: '',
      
      // CVSS 4.0 Object
      cvss40Obj: {
        version: '4.0',
        AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N',
        VC: 'N', VI: 'N', VA: 'N', SC: 'N', SI: 'N', SA: 'N',
        E: '',
        CR: '', IR: '', AR: '',
        // Modified Base Metrics (Environmental)
        MAV: '', MAC: '', MAT: '', MPR: '', MUI: '',
        MVC: '', MVI: '', MVA: '', MSC: '', MSI: '', MSA: '',
        // Supplemental Metrics
        S: '', AU: '', R: '', V: '', RE: '', U: ''
      },
      
      cvss40: {
        baseMetricScore: '',
        baseSeverity: '',
        threatMetricScore: '',
        threatSeverity: '',
        environmentalMetricScore: '',
        environmentalSeverity: '',
        exploitability: '',
        vulnerableSystemImpact: '',
        subsequentSystemImpact: ''
      },
      
      tooltip: {
        anchor: 'bottom middle',
        self: 'top left',
        delay: 500,
        maxWidth: '700px',
        class: '',
        style: 'font-size: 12px'
      },
      
      // Flag to prevent infinite loops during version switching
      isChangingVersion: false,
      
      // Flag to prevent watcher from triggering during initialization
      isInitializing: true
    };
  },

  computed: {
    cvss40Items() {
      return {
        AV: [
          { label: this.$t('cvss4.values.network'), value: 'N' },
          { label: this.$t('cvss4.values.adjacent'), value: 'A' },
          { label: this.$t('cvss4.values.local'), value: 'L' },
          { label: this.$t('cvss4.values.physical'), value: 'P' }
        ],
        AC: [
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        AT: [
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.present'), value: 'P' }
        ],
        PR: [
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        UI: [
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.passive'), value: 'P' },
          { label: this.$t('cvss4.values.active'), value: 'A' }
        ],
        
        // Vulnerable System Impact
        VC: [
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        VI: [
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        VA: [
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        
        // Subsequent Systems Impact
        SC: [
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        SI: [
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        SA: [
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        
        // Threat Metrics
        E: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.attacked'), value: 'A' },
          { label: this.$t('cvss4.values.unreported'), value: 'U' },
          { label: this.$t('cvss4.values.proofOfConcept'), value: 'P' },
          { label: this.$t('cvss4.values.functional'), value: 'F' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        
        // Environmental Requirements
        CR: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.medium'), value: 'M' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        IR: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.medium'), value: 'M' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        AR: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.medium'), value: 'M' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        
        // Modified Base Metrics (Environmental)
        MAV: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.network'), value: 'N' },
          { label: this.$t('cvss4.values.adjacent'), value: 'A' },
          { label: this.$t('cvss4.values.local'), value: 'L' },
          { label: this.$t('cvss4.values.physical'), value: 'P' }
        ],
        MAC: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        MAT: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.present'), value: 'P' }
        ],
        MPR: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        MUI: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.passive'), value: 'P' },
          { label: this.$t('cvss4.values.active'), value: 'A' }
        ],
        MVC: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        MVI: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        MVA: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        MSC: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        MSI: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        MSA: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        
        // Supplemental Metrics
        S: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.present'), value: 'P' },
          { label: this.$t('cvss4.values.high'), value: 'H' } // Assuming 'Safety' high is translated as High
        ],
        AU: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.none'), value: 'N' },
          { label: this.$t('cvss4.values.yes'), value: 'Y' }
        ],
        R: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.automatic'), value: 'A' },
          { label: this.$t('cvss4.values.user'), value: 'U' },
          { label: this.$t('cvss4.values.irrecoverable'), value: 'I' }
        ],
        V: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.diffuse'), value: 'D' },
          { label: this.$t('cvss4.values.concentrated'), value: 'C' }
        ],
        RE: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.low'), value: 'L' },
          { label: this.$t('cvss4.values.medium'), value: 'M' },
          { label: this.$t('cvss4.values.high'), value: 'H' }
        ],
        U: [
          { label: this.$t('cvss4.values.notDefined'), value: 'X' },
          { label: this.$t('cvss4.values.clear'), value: 'C' },
          { label: this.$t('cvss4.values.green'), value: 'G' },
          { label: this.$t('cvss4.values.functional'), value: 'F' }, // Reusing functional? Or is it different for Urgency? It says "Functional" in original.
          { label: this.$t('cvss4.values.red'), value: 'R' }
        ]
      };
    }
  },

  created() {
    // Initialize internal state from props
    this.internalCvss3Vector = this.modelValue || '';
    this.internalCvss4Vector = this.cvssv4Value || '';
    
    // PRIORITÉ AUX PARAMÈTRES DE LA PLATEFORME (pas aux données existantes)
    this.loadDefaultCvssVersionSimple();
    
    this.initializeFromModelValue();
    
    // Fin de l'initialisation, permettre au watcher de fonctionner
    this.$nextTick(() => {
      this.isInitializing = false;
    });
  },

  mounted() {
    // Ensure CVSS40 calculations are done after component is fully mounted
    if (this.cvssVersion === '4.0' && this.internalCvss4Vector) {
      this.calculateCvss40Score(this.internalCvss4Vector);
    }
  },

  watch: {
    modelValue(val) {
      // Update internal state
      this.internalCvss3Vector = val || '';
      
      // Don't reinitialize during version switching
      if (this.isChangingVersion) return;
      
      // Only reinitialize if the version in the vector doesn't match current version
      if (val) {
        const vectorVersion = val.startsWith('CVSS:4.0') ? '4.0' : '3.1';
        if (vectorVersion !== this.cvssVersion) {
          this.initializeFromModelValue();
        }
      }
    },
    cvssv4Value(val) {
      // Update internal state
      this.internalCvss4Vector = val || '';
      
      // Don't reinitialize during version switching
      if (this.isChangingVersion) return;
      
      // If we have CVSS 4.0 data and we're currently on CVSS 4.0, update
      if (val && val.startsWith('CVSS:4.0') && this.cvssVersion === '4.0') {
        this.cvss40StrToObject(val);
        this.calculateCvss40Score(val);
      }
    },
    cvssVersion: {
      handler(newVersion, oldVersion) {
        // Ne déclencher le changement que si c'est un changement manuel (pas d'initialisation)
        if (oldVersion && oldVersion !== newVersion && !this.isInitializing) {
          this.onVersionChange(newVersion);
        }
      },
      deep: true
    },
    cvss40Obj: {
      handler() {
        if (this.cvssVersion === '4.0' && !this.isChangingVersion) {
          this.cvss40ObjectToStr();
        }
      },
      deep: true
    }
  },

  methods: {
    initializeFromModelValue() {
      // Initialize based on the chosen version (from platform settings)
      if (this.cvssVersion === '4.0') {
        if (!this.cvss40Obj || !this.cvss40Obj.version) {
          this.cvss40Obj = {
            version: '4.0',
            AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N',
            VC: 'N', VI: 'N', VA: 'N', SC: 'N', SI: 'N', SA: 'N',
            E: '',
            CR: '', IR: '', AR: '',
            // Modified Base Metrics (Environmental)
            MAV: '', MAC: '', MAT: '', MPR: '', MUI: '',
            MVC: '', MVI: '', MVA: '', MSC: '', MSI: '', MSA: '',
            // Supplemental Metrics
            S: '', AU: '', R: '', V: '', RE: '', U: ''
          };
        }
        
        // If we have existing CVSS 4.0 data, parse it
        if (this.cvssv4Value && this.cvssv4Value.startsWith('CVSS:4.0')) {
          this.cvss40StrToObject(this.cvssv4Value);
          this.calculateCvss40Score(this.cvssv4Value);
        }
        
        // Convert existing CVSS 3.1 data to CVSS 4.0 if available
        if (this.modelValue && this.modelValue.startsWith('CVSS:3.1')) {
          // Si on n'a pas de vraies données CVSS 4.0, convertir depuis CVSS 3.1
          if (!this.cvssv4Value || this.cvssv4Value === 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:N/SC:N/SI:N/SA:N') {
            this.convertCvss31To40(this.modelValue);
          }
        }
      }
    },

    onVersionChange(newVersion) {
      this.isChangingVersion = true;
      
      if (newVersion === '4.0') {
        // Use existing CVSS 4.0 data from props if available, otherwise default
        let cvss4Vector = this.cvssv4Value;
        
        if (!cvss4Vector || !cvss4Vector.startsWith('CVSS:4.0')) {
          // No existing CVSS 4.0 data, use default
          cvss4Vector = 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:N/SC:N/SI:N/SA:N';
        }
        
        // Update internal state
        this.internalCvss4Vector = cvss4Vector;
        
        // Initialize CVSS 4.0 object ONLY if it doesn't exist
        if (!this.cvss40Obj || !this.cvss40Obj.version) {
          this.cvss40Obj = {
            version: '4.0',
            AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N',
            VC: 'N', VI: 'N', VA: 'N', SC: 'N', SI: 'N', SA: 'N',
            E: '',
            CR: '', IR: '', AR: '',
            // Modified Base Metrics (Environmental)
            MAV: '', MAC: '', MAT: '', MPR: '', MUI: '',
            MVC: '', MVI: '', MVA: '', MSC: '', MSI: '', MSA: '',
            // Supplemental Metrics
            S: '', AU: '', R: '', V: '', RE: '', U: ''
          };
        }
        
        // Parse existing vector
        this.cvss40StrToObject(cvss4Vector);
        this.calculateCvss40Score(cvss4Vector);
        
        // CVSS 4.0: save only to cvssv4Value, don't touch modelValue (cvssv3)
        this.$emit('update:cvssv4Value', cvss4Vector);
      } else {
        // Switch back to CVSS 3.1 - use existing data from props
        let cvss3Vector = this.modelValue;
        
        if (!cvss3Vector || cvss3Vector.startsWith('CVSS:4.0')) {
          // No existing CVSS 3.1 data, use default
          cvss3Vector = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N';
        }
        
        // Update internal state
        this.internalCvss3Vector = cvss3Vector;
        
        // Emit CVSS 3.1 vector to modelValue (for display)
        this.$emit('update:modelValue', cvss3Vector);
      }
      
      // Reset flag after a short delay
      this.$nextTick(() => {
        this.isChangingVersion = false;
      });
    },

    convertCvss31To40(cvss31Vector) {
      try {
        // Parser le vecteur CVSS 3.1
        const parts = cvss31Vector.split('/');
        const cvss31Data = {};
        
        parts.forEach(part => {
          if (part.includes(':')) {
            const [metric, value] = part.split(':');
            cvss31Data[metric] = value;
          }
        });
        
        // Conversion des métriques CVSS 3.1 vers CVSS 4.0
        const cvss40Data = {
          AV: cvss31Data.AV || 'N',
          AC: cvss31Data.AC || 'L',
          AT: 'N', // Nouveau en CVSS 4.0, par défaut None
          PR: cvss31Data.PR || 'N',
          UI: cvss31Data.UI || 'N',
          VC: cvss31Data.C || 'N', // Confidentiality -> VC
          VI: cvss31Data.I || 'N', // Integrity -> VI
          VA: cvss31Data.A || 'N', // Availability -> VA
          SC: 'N', // Nouveau en CVSS 4.0, par défaut None
          SI: 'N', // Nouveau en CVSS 4.0, par défaut None
          SA: 'N'  // Nouveau en CVSS 4.0, par défaut None
        };
        
        // Mettre à jour cvss40Obj
        Object.keys(cvss40Data).forEach(key => {
          if (this.cvss40Obj[key] !== undefined) {
            this.cvss40Obj[key] = cvss40Data[key];
          }
        });
        
        // Générer le vecteur CVSS 4.0
        const cvss40Vector = `CVSS:4.0/AV:${cvss40Data.AV}/AC:${cvss40Data.AC}/AT:${cvss40Data.AT}/PR:${cvss40Data.PR}/UI:${cvss40Data.UI}/VC:${cvss40Data.VC}/VI:${cvss40Data.VI}/VA:${cvss40Data.VA}/SC:${cvss40Data.SC}/SI:${cvss40Data.SI}/SA:${cvss40Data.SA}`;
        
        // Mettre à jour l'état interne et émettre
        this.internalCvss4Vector = cvss40Vector;
        this.$emit('update:cvssv4Value', cvss40Vector);
        
        // Calculer le score
        this.calculateCvss40Score(cvss40Vector);
        
      } catch (error) {
        console.error('Erreur lors de la conversion CVSS 3.1 -> 4.0:', error);
      }
    },
    
    roundUp1(n) {
      return window.CVSS40 ? window.CVSS40.roundUp1(n) : n;
    },

    calculateCvss40Score(vectorString) {
      if (!vectorString) return;
      
      // Wait for CVSS40 to be available
      if (!window.CVSS40) {
        // Retry after a short delay
        setTimeout(() => this.calculateCvss40Score(vectorString), 100);
        return;
      }
      
      try {
        this.cvss40 = window.CVSS40.calculateCVSSFromVector(vectorString);
      } catch (error) {
        console.error('Erreur lors du calcul CVSS 4.0:', error);
        // Reset to default values if calculation fails
        this.cvss40 = {
          baseMetricScore: '',
          baseSeverity: '',
          threatMetricScore: '',
          threatSeverity: '',
          environmentalMetricScore: '',
          environmentalSeverity: '',
          exploitability: '',
          vulnerableSystemImpact: '',
          subsequentSystemImpact: ''
        };
      }
    },

    loadDefaultCvssVersionSimple() {
      // Use synchronous approach to avoid timing issues
      SettingsService.getPublicSettings()
        .then(response => {
          // Essayer différentes structures possibles
          const defaultVersion = response.data?.datas?.report?.public?.defaultCvssVersion || 
                                response.data?.report?.public?.defaultCvssVersion || 
                                '3.1';
          
          this.cvssVersion = defaultVersion;
          
          // Initialize the appropriate object for the default version ONLY if it doesn't exist
          if (defaultVersion === '4.0' && (!this.cvss40Obj || !this.cvss40Obj.version)) {
            this.cvss40Obj = {
              version: '4.0',
              AV: 'N', AC: 'L', AT: 'N', PR: 'N', UI: 'N',
              VC: 'N', VI: 'N', VA: 'N', SC: 'N', SI: 'N', SA: 'N',
              E: '',
              CR: '', IR: '', AR: '',
              MAV: '', MAC: '', MAT: '', MPR: '', MUI: '',
              MVC: '', MVI: '', MVA: '', MSC: '', MSI: '', MSA: '',
              S: '', AU: '', R: '', V: '', RE: '', U: ''
            };
          }
        })
        .catch(error => {
          console.error('Erreur lors du chargement des paramètres:', error);
          this.cvssVersion = '3.1';
        });
    },

    cvss40StrToObject(str) {
      if (str) {
        const temp = str.split('/');
        for (let i = 0; i < temp.length; i++) {
          const elt = temp[i].split(':');
          if (this.cvss40Obj.hasOwnProperty(elt[0])) {
            this.cvss40Obj[elt[0]] = elt[1] || '';
          }
        }
      }
    },

    cvss40ObjectToStr() {
      let vectorString = 'CVSS:' + this.cvss40Obj.version;
      
      // Base metrics are required - always include them
      const requiredMetrics = ['AV', 'AC', 'AT', 'PR', 'UI', 'VC', 'VI', 'VA', 'SC', 'SI', 'SA'];
      
      for (const key of requiredMetrics) {
        const value = this.cvss40Obj[key] || 'N'; // Default to 'N' if empty
        vectorString += `/${key}:${value}`;
      }
      
      // Optional metrics - only include if they have a value
      for (const key in this.cvss40Obj) {
        if (key !== 'version' && !requiredMetrics.includes(key) && this.cvss40Obj[key]) {
          vectorString += `/${key}:${this.cvss40Obj[key]}`;
        }
      }

      // Calculate CVSS score
      this.calculateCvss40Score(vectorString);
      
      // Update internal state
      this.internalCvss4Vector = vectorString;
      
      // CVSS 4.0: save only to cvssv4Value, don't touch modelValue (cvssv3)
      this.$emit('update:cvssv4Value', vectorString);
    },

    onCvss3Change(vectorString) {
      // Update internal state for CVSS 3.1
      this.internalCvss3Vector = vectorString;
      this.$emit('update:modelValue', vectorString);
    }
  }
});
</script>

<style>
/* Use existing styles from cvsscalculator.vue */
.group-btn .q-btn {
    border: 1px solid #ccc;
}

.group-btn .q-btn-inner div {
    font-weight: 400;
}

.baseSeverity {
    font-size: 16px;
    font-weight: normal;
    margin-bottom: 5px;
    display: block;
}

.baseMetricScore {
    display: block;
    font-size: 32px;
    line-height: 32px;
    font-weight: normal;
    margin-top: 4px;
}

.scoreRating {
    width: 100px;
    top: -4px;
    right: 20px;
    border: 2px solid #666666;
    background: #dddddd;
    font-size: 11px;
    border-radius: 10px;
    line-height: 150%;
    text-align: center;
    height: fit-content!important;
    position: absolute;
}

.scoreRating.None {
    background: #53aa33;
    border: 2px solid #53aa33;
    color: white;
}

.scoreRating.Low {
    background: #ffcb0d;
    border: 2px solid #ffcb0d;
    color: white;
}

.scoreRating.Medium {
    background: #f9a009;
    border: 2px solid #f9a009;
    color: white;
}

.scoreRating.High {
    background: #df3d03;
    border: 2px solid #df3d03;
    color: white;
}

.scoreRating.Critical {
    background: #212121;
    border: 2px solid #212121;
    color: white;
}
</style>
