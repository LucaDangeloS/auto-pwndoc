module.exports = function(request, app) {
    describe('Application settings', () => {
      var userToken = '';
      beforeAll(async () => {
        var response = await request(app).post('/api/users/token').send({username: 'admin', password: 'Admin123'})
        userToken = response.body.datas.token
      })

      const defaultAiPrivatePrompts = {
        "generateSystemPrompt": "",
        "generateUserPrompt": "",
        "completeSystemPrompt": "",
        "completeUserPrompt": "",
        "rewriteSystemPrompt": "",
        "rewriteUserPrompt": "",
        "fillProofsSystemPrompt": "",
        "executiveSummarySystemPrompt": "",
        "severitySummarySystemPrompt": "",
        "field_description_generateSystemPrompt": "",
        "field_description_completeSystemPrompt": "",
        "field_description_rewriteSystemPrompt": "",
        "field_observation_generateSystemPrompt": "",
        "field_observation_completeSystemPrompt": "",
        "field_observation_rewriteSystemPrompt": "",
        "field_remediation_generateSystemPrompt": "",
        "field_remediation_completeSystemPrompt": "",
        "field_remediation_rewriteSystemPrompt": "",
        "field_poc_generateSystemPrompt": "",
        "field_poc_completeSystemPrompt": "",
        "field_poc_rewriteSystemPrompt": "",
        "field_retestEvidence_generateSystemPrompt": "",
        "field_retestEvidence_completeSystemPrompt": "",
        "field_retestEvidence_rewriteSystemPrompt": "",
      }

      const defaultChartTheme = {
        "borderColor": "#d9e2f3",
        "borderEnabled": false,
        "borderWidth": 1,
        "dataLabelBold": true,
        "dataLabelColor": "#ffffff",
        "dataLabelMode": "value",
        "dataLabelSize": 11,
        "legendColor": "#404040",
        "legendPosition": "r",
        "legendSize": 11,
        "plotAreaFill": "none",
        "titleBold": true,
        "titleColor": "#000000",
        "titleSize": 16,
        "view3DPerspective": 30,
        "view3DRightAngleAxes": false,
        "view3DRotX": 30,
        "view3DRotY": 30,
      }

      const defaultPublicSettings = {
        "report": {
            "enabled": true,
            "public": {
              "captions": [
                "Figure",
              ],
              "chartTheme": defaultChartTheme,
              "cvssColors": {
                "criticalColor": "#212121",
                "highColor": "#fe0000",
                "lowColor": "#008000",
                "mediumColor": "#f9a009",
                "noneColor": "#4a86e8",
              },
              "defaultCvssVersion": "3.1",
              "extendCvssTemporalEnvironment": false,
              "remediationColorsComplexity": {
                "highColor": "#FF2F2F",
                "lowColor": "#4472c4",
                "mediumColor": "#ffc000",
              },
              "remediationColorsPriority": {
                "highColor": "#ff2f2f",
                "lowColor": "#4472c4",
                "mediumColor": "#ffc000",
                "urgentColor": "#C00000",
              },
            },
          },
        "reviews": {
          "enabled": false,
          "public": {
            "mandatoryReview": false,
            "minReviewers": 1,
          },
        },
        "danger": { 
          "enabled": false,
          "public": {
            "nbdaydelete": 1,
            },
         },
        "ai": {
          "enabled": false,
          "embeddingEnabled": false,
          "public": {
            "provider": "openai",
            "model": "gpt-4o",
            "temperature": 0.7,
            "maxTokens": 4096,
            "embeddingProvider": "openai",
            "embeddingModel": "text-embedding-3-small",
            "embeddingMaxDistance": 0.8,
          },
          "visionEnabled": false,
          "visionPublic": {
            "visionProvider": "openai",
            "visionModel": "gpt-4o",
          },
        },
        "mcp": {
          "enabled": false,
          "appUrl": "https://localhost:8443",
        },
      };

      const defaultSettings = {
        "report": {
            "enabled": true,
            "private": {
              "imageBorder": false,
              "imageBorderColor": "#000000",
            },
            "public": {
              "captions": [
                "Figure",
              ],
              "chartTheme": defaultChartTheme,
              "cvssColors": {
                "criticalColor": "#212121",
                "highColor": "#fe0000",
                "lowColor": "#008000",
                "mediumColor": "#f9a009",
                "noneColor": "#4a86e8",
              },
              "defaultCvssVersion": "3.1",
              "extendCvssTemporalEnvironment": false,
              "remediationColorsComplexity": {
                "highColor": "#FF2F2F",
                "lowColor": "#4472c4",
                "mediumColor": "#ffc000",
              },
              "remediationColorsPriority": {
                "highColor": "#ff2f2f",
                "lowColor": "#4472c4",
                "mediumColor": "#ffc000",
                "urgentColor": "#C00000",
              },
            },
          },
        "reviews": {
          "enabled": false,
          "private": {
            "removeApprovalsUponUpdate": false,
          },
          "public": {
            "mandatoryReview": false,
            "minReviewers": 1,
          },
        },
        "danger": { 
          "enabled": false,
          "public": {
            "nbdaydelete": 1,
            },
         },
        "ai": {
          "enabled": false,
          "embeddingEnabled": false,
          "public": {
            "provider": "openai",
            "model": "gpt-4o",
            "temperature": 0.7,
            "maxTokens": 4096,
            "embeddingProvider": "openai",
            "embeddingModel": "text-embedding-3-small",
            "embeddingMaxDistance": 0.8,
          },
          "private": {
            "apiUrl": "",
            "apiKey": "",
            "systemPrompt": "",
            "userPrompt": "",
            "azure": {
              "deploymentName": "",
              "apiVersion": "2024-06-01",
            },
            "embeddingApiUrl": "",
            "embeddingApiKey": "",
            "embeddingAzure": {
              "deploymentName": "",
              "apiVersion": "2024-06-01",
            },
            "visionApiUrl": "",
            "visionApiKey": "",
            "visionAzure": {
              "deploymentName": "",
              "apiVersion": "2024-06-01",
            },
            "visionSystemPrompt": "",
            "visionAnonymizeLlm": false,
            "visionAnonymizeRegex": false,
            ...defaultAiPrivatePrompts,
          },
          "visionEnabled": false,
          "visionPublic": {
            "visionProvider": "openai",
            "visionModel": "gpt-4o",
          },
        },
        "mcp": {
          "enabled": false,
          "apiKey": "",
          "apiKeyCreatedAt": null,
          "appUrl": "https://localhost:8443",
        },
      };

      it('Get settings', async () => {
          var response = await request(app).get('/api/settings')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ]);
      
          expect(response.status).toBe(200);
          expect(response.body.datas).toEqual(defaultSettings);
      })

      it('Get public settings', async () => {
          var response = await request(app).get('/api/settings/public')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ]);
          expect(response.status).toBe(200);
          expect(response.body.datas).toEqual(defaultPublicSettings);
      })

      it('Edit settings', async () => {
        const fullModification = {
          "report": {
              "enabled": false,
              "private": {
                "imageBorder": true,
                "imageBorderColor": "#123456",
              },
              "public": {
                "captions": [
                  "Figure",
                  "Test",
                ],
                "chartTheme": defaultChartTheme,
                "cvssColors": {
                  "criticalColor": "#123456",
                  "highColor": "#123456",
                  "lowColor": "#123456",
                  "mediumColor": "#123456",
                "noneColor": "#123456",
              },
              "defaultCvssVersion": "3.1",
              "extendCvssTemporalEnvironment": false,
              "remediationColorsComplexity": {
                  "highColor": "#FF2F2F",
                  "lowColor": "#4472c4",
                  "mediumColor": "#ffc000",
                },
                "remediationColorsPriority": {
                  "highColor": "#ff2f2f",
                  "lowColor": "#4472c4",
                  "mediumColor": "#ffc000",
                  "urgentColor": "#C00000",
                },
              },
            },
          "reviews": {
            "enabled": true,
            "private": {
              "removeApprovalsUponUpdate": true,
            },
            "public": {
              "mandatoryReview": true,
              "minReviewers": 2,
            },
          },
          "danger": { 
            "enabled": true,
            "public": {
              "nbdaydelete": 2,
            },
          },
          "ai": {
            "enabled": true,
            "embeddingEnabled": false,
            "public": {
              "provider": "ollama",
              "model": "llama3",
              "temperature": 0.5,
              "maxTokens": 8192,
              "embeddingProvider": "openai",
              "embeddingModel": "text-embedding-3-small",
              "embeddingMaxDistance": 0.8,
            },
            "private": {
              "apiUrl": "http://localhost:11434",
              "apiKey": "",
              "systemPrompt": "",
              "userPrompt": "",
              "azure": {
                "deploymentName": "",
                "apiVersion": "2024-06-01",
              },
              "embeddingApiUrl": "",
              "embeddingApiKey": "",
              "embeddingAzure": {
                "deploymentName": "",
                "apiVersion": "2024-06-01",
              },
              "visionApiUrl": "",
              "visionApiKey": "",
              "visionAzure": {
                "deploymentName": "",
                "apiVersion": "2024-06-01",
              },
              "visionSystemPrompt": "",
              "visionAnonymizeLlm": false,
              "visionAnonymizeRegex": false,
              ...defaultAiPrivatePrompts,
            },
            "visionEnabled": false,
            "visionPublic": {
              "visionProvider": "openai",
              "visionModel": "gpt-4o",
            },
          },
          "mcp": {
            "enabled": false,
            "apiKey": "",
            "apiKeyCreatedAt": null,
            "appUrl": "https://localhost:8443",
          },
        };
        
        var response = await request(app).put('/api/settings')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
          .send(fullModification);
        expect(response.status).toBe(200);

        var response = await request(app).get('/api/settings')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ]);
        expect(response.status).toBe(200);
        expect(response.body.datas).toEqual(fullModification);

        const partialModification = {
          "reviews": {
            "public": {
              "mandatoryReview": false,
              "minReviewers": 5,
            }
          }
        };
        var response = await request(app).put('/api/settings')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
          .send(partialModification);
        expect(response.status).toBe(200);

        var response = await request(app).get('/api/settings')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ]);
        expect(response.status).toBe(200);

        expect(response.body.datas.reviews.public.mandatoryReview).toEqual(false);
        expect(response.body.datas.reviews.public.minReviewers).toEqual(5);
        expect(response.body.datas.report.private.imageBorderColor).toEqual("#123456");
    })

    it('Revert settings', async () => {
      var response = await request(app).put('/api/settings/revert')
        .set('Cookie', [
          `token=JWT ${userToken}`
        ]);
      expect(response.status).toBe(200);

      var response = await request(app).get('/api/settings')
        .set('Cookie', [
          `token=JWT ${userToken}`
        ]);
      expect(response.status).toBe(200);
      expect(response.body.datas).toEqual(defaultSettings);
    })

    it('Export settings', async () => {
      var response = await request(app).get('/api/settings/export')
        .set('Cookie', [
          `token=JWT ${userToken}`
        ]);
      expect(response.status).toBe(200);
      expect(response.type).toEqual('application/json');
      expect(response.headers['content-disposition'].indexOf('attachment; filename=')).toBe(0);
    })

    })
  }
