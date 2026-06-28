module.exports = function () {
  var html2ooxml = require("../src/lib/html2ooxml")
  var utils = require("../src/lib/utils")
  var chartGenerator = require("../src/lib/chart-generator")
  var reportGenerator = require("../src/lib/report-generator")
  var translateService = require("../src/lib/translate-service")
  var aiService = require("../src/lib/ai-service")
  var visionService = require("../src/lib/vision-service")

  describe('Lib functions Suite Tests', () => {

    describe('Name format validation tests', () => {
      it('Valid Filename', () => {
        var filename = "Vulnerability 1"
        var result = utils.validFilename(filename)
        expect(result).toEqual(true)
      })

      it('Valid Latin Filename', () => {
        var filename = "Vulnerabilité 1"
        var result = utils.validFilename(filename)
        expect(result).toEqual(true)
      })

      it('Valid Latvian Filename', () => {
        var filename = "Pažeidžiamumas 1"
        var result = utils.validFilename(filename)
        expect(result).toEqual(true)
      })

      it('Valid Filename with special chars', () => {
        var filename = "Vulnerability_1-test"
        var result = utils.validFilename(filename)
        expect(result).toEqual(true)
      })

      it('Invalid Filename', () => {
        var filename = "<Vulnerability> 1"
        var result = utils.validFilename(filename)
        expect(result).toEqual(false)
      })
    })

    describe('chart generator tests', () => {
      it('Generates editable 3D pie chart XML', () => {
        var xml = chartGenerator.generatePie3DChart({
          title: 'Vulnerabilities',
          severities: [
            { label: 'Critical', value: 1, color: '212121' },
            { label: 'High', value: 2, color: 'FE0000' },
            { label: 'Medium', value: 3, color: 'F9A009' },
            { label: 'Low', value: 4, color: '008000' },
            { label: 'Informational', value: 5, color: '4A86E8' },
          ],
          theme: {
            titleColor: '000000', titleSize: 16, titleBold: true,
            legendColor: '404040', legendSize: 11, legendPosition: 'r',
            dataLabelColor: 'FFFFFF', dataLabelSize: 11, dataLabelBold: true, dataLabelMode: 'value',
            borderEnabled: true, borderColor: 'D9E2F3', borderWidth: 1, plotAreaFill: 'none',
            view3DRotX: 30, view3DRotY: 30, view3DPerspective: 30, view3DRightAngleAxes: false, pieExplosion: 12,
          }
        })

        expect(xml).toContain('<c:pie3DChart>')
        expect(xml).toContain('<c:view3D>')
        expect(xml).toContain('<c:rotX val="30"/>')
        expect(xml).toContain('<c:perspective val="30"/>')
        expect((xml.match(/<c:dPt>/g) || []).length).toEqual(5)
        expect(xml).toContain('<a:srgbClr val="212121"/>')
        expect(xml).toContain('<a:srgbClr val="4A86E8"/>')
        expect(xml).toContain('<c:v>Informational</c:v>')
        expect(xml).toContain('<c:v>5</c:v>')
        expect((xml.match(/<c:explosion val="12"\/>/g) || []).length).toEqual(5)
        expect((xml.match(/<a:effectLst>/g) || []).length).toEqual(5)
      })
    })

    describe('vulnerability translation prompt tests', () => {
      it('uses configurable vulnerability translation system prompt tags', () => {
        var prompt = translateService._buildTranslationSystemPrompt({
          private: {
            vulnerabilityTranslationSystemPrompt: 'Translate {fieldName} from {fromLanguage}/{fromLocale} to {toLanguage}/{toLocale}.'
          }
        }, 'description', 'en', 'es')

        expect(prompt).toEqual('Translate description from English/en to Spanish/es.')
      })

      it('falls back to the built-in vulnerability translation prompt', () => {
        var prompt = translateService._buildTranslationSystemPrompt({ private: {} }, 'title', 'en', 'de')

        expect(prompt).toContain('professional technical translator')
        expect(prompt).toContain('from English to German')
      })
    })

    describe('AI prompt context tests', () => {
      it('converts rich finding content to bounded text without image data', () => {
        var context = aiService._htmlToContextText(
          '<p>Observed response</p><img src="data:image/png;base64,SECRET" alt="ignore"><p>confirmed.</p>',
          200
        )

        expect(context).toEqual('Observed response [IMAGE 1 OMITTED] confirmed.')
        expect(context).not.toContain('SECRET')
        expect(context).not.toContain('data:image')
      })

      it('marks truncated AI context', () => {
        var context = aiService._htmlToContextText(`<p>${'a'.repeat(100)}</p>`, 40)

        expect(context.length).toBeLessThanOrEqual(40)
        expect(context).toContain('[TRUNCATED]')
      })

      it('preserves executive digest line structure', () => {
        var digest = aiService._truncateMultilineContext(
          '- [High] Finding one\n  Description: First issue\n- [Low] Finding two',
          500
        )

        expect(digest.split('\n')).toHaveLength(3)
        expect(digest).toContain('Description: First issue')
      })

      it('only requests optional PoC vision when the active prompt uses its tag', () => {
        expect(aiService._promptUsesVariable(
          'Use the supplied proof cautiously.',
          'Proof: {findingPoc}',
          'findingPocVision'
        )).toEqual(false)

        expect(aiService._promptUsesVariable(
          'Use this visual analysis: {findingPocVision}',
          'Proof: {findingPoc}',
          'findingPocVision'
        )).toEqual(true)
      })

      it('interpolates finding and audit context tags', () => {
        var rendered = aiService._fillTemplate(
          '{findingDescription}|{findingPoc}|{findingPocVision}|{auditContext}',
          {
            findingDescription: 'Description',
            findingPoc: 'Proof',
            findingPocVision: 'Vision',
            auditContext: 'External assessment'
          }
        )

        expect(rendered).toEqual('Description|Proof|Vision|External assessment')
      })

      it('normalizes executive summary HTML lists into paragraphs', () => {
        var html = aiService._normalizeExecutiveSummaryHtml(
          '<ul><li>Primera idea ejecutiva.</li><li>Segunda idea ejecutiva.</li></ul>'
        )

        expect(html).toEqual('<p>Primera idea ejecutiva.</p>\n<p>Segunda idea ejecutiva.</p>')
        expect(html).not.toContain('<li>')
        expect(html).not.toContain('<ul>')
      })

      it('normalizes markdown bullets in executive summaries into paragraphs', () => {
        var html = aiService._normalizeExecutiveSummaryHtml(
          '- Primera idea ejecutiva.\n- Segunda idea ejecutiva.'
        )

        expect(html).toEqual('<p>Primera idea ejecutiva.</p>\n<p>Segunda idea ejecutiva.</p>')
        expect(html).not.toContain('- Primera')
      })

      it('removes risk-level prelude sentences from executive summaries', () => {
        var html = aiService._normalizeExecutiveSummaryHtml(
          '<p>El auditor ha determinado que el riesgo general de la infraestructura es Medio. Durante el proceso de evaluación de seguridad llevado a cabo sobre el aplicativo, el equipo de pruebas de penetración ha identificado varias vulnerabilidades que podrían exponer riesgos significativos.</p><p>La gravedad de estas vulnerabilidades radica en la exposición de información sensible.</p>'
        )

        expect(html).toContain('Durante el proceso de evaluación de seguridad')
        expect(html).not.toContain('El auditor ha determinado')
        expect(html).not.toContain('riesgo general')
      })

      it('removes model reasoning artifacts from executive summaries', () => {
        var html = aiService._normalizeExecutiveSummaryHtml(
          '<p>Thinking Process:</p><p>Analyze the Request: write three paragraphs.</p><p>Durante el proceso de evaluación de seguridad llevado a cabo sobre el aplicativo, el equipo de pruebas de penetración ha identificado varias vulnerabilidades que podrían exponer riesgos significativos.</p>'
        )

        expect(html).toEqual('<p>Durante el proceso de evaluación de seguridad llevado a cabo sobre el aplicativo, el equipo de pruebas de penetración ha identificado varias vulnerabilidades que podrían exponer riesgos significativos.</p>')
        expect(html).not.toContain('Thinking Process')
        expect(html).not.toContain('Analyze the Request')
      })

      it('wraps plain executive summary paragraphs in HTML paragraphs', () => {
        var html = aiService._normalizeExecutiveSummaryHtml(
          'Durante el proceso de evaluación de seguridad llevado a cabo sobre el aplicativo, el equipo de pruebas de penetración ha identificado varias vulnerabilidades.\n\nLa gravedad de estas vulnerabilidades radica en la exposición de información sensible.\n\nEsto afecta principalmente la confidencialidad de los datos.'
        )

        expect(html).toContain('<p>Durante el proceso de evaluación de seguridad')
        expect(html).toContain('</p>\n<p>La gravedad')
        expect(html).toContain('</p>\n<p>Esto afecta')
      })

      it('splits long single-paragraph executive summaries into report paragraphs', () => {
        var html = aiService._normalizeExecutiveSummaryHtml(
          'Durante el proceso de evaluación de seguridad llevado a cabo sobre el aplicativo, el equipo de pruebas de penetración ha identificado varias vulnerabilidades que proporcionan información valiosa y posibles puntos de entrada. Estas vulnerabilidades no comprometen directamente sistemas críticos, pero podrían exponer riesgos significativos para la organización. La gravedad de estas vulnerabilidades radica en que permitirían a un atacante potencial acceder a información sensible y a datos críticos de la organización. Además, algunas debilidades pueden afectar la disponibilidad e integridad de determinados sistemas y datos. Este escenario podría resultar en exposición de datos confidenciales e interrupciones operativas menores. Esto afecta principalmente la confidencialidad de los datos.'
        )

        expect((html.match(/<p>/g) || []).length).toBe(3)
        expect(html).toContain('</p>\n<p>La gravedad')
        expect(html).toContain('</p>\n<p>Este escenario')
      })

      it('splits long single HTML paragraph executive summaries into report paragraphs', () => {
        var html = aiService._normalizeExecutiveSummaryHtml(
          '<p>Durante el proceso de evaluación de seguridad llevado a cabo sobre el aplicativo, el equipo de pruebas de penetración ha identificado varias vulnerabilidades que proporcionan información valiosa y posibles puntos de entrada. La gravedad de estas vulnerabilidades radica en que permitirían acceder a información sensible y a datos críticos, además de afectar parcialmente la disponibilidad e integridad de determinados sistemas y datos de negocio. Esto afecta principalmente la confidencialidad de los datos.</p>'
        )

        expect((html.match(/<p>/g) || []).length).toBe(3)
        expect(html).toContain('</p>\n<p>La gravedad')
      })

      it('removes later executive-summary sentences that restate overall risk', () => {
        var html = aiService._normalizeExecutiveSummaryHtml(
          '<p>Durante el proceso de evaluación de seguridad llevado a cabo sobre el aplicativo, el equipo de pruebas de penetración ha identificado varias vulnerabilidades. El riesgo global se considera medio por el conjunto de hallazgos.</p><p>Esto afecta principalmente la confidencialidad de los datos.</p>'
        )

        expect(html).toContain('Durante el proceso de evaluación')
        expect(html).not.toContain('riesgo global')
        expect(html).not.toContain('considera medio')
      })

      it('documents the report-derived executive summary prompt guardrails', () => {
        var systemPrompt = aiService._getDefaultSystemPrompt('executive-summary')
        var userPrompt = aiService._getDefaultUserPrompt('executive-summary')

        expect(systemPrompt).toContain('/no_think')
        expect(systemPrompt).toContain('Do not include analysis, reasoning, planning')
        expect(systemPrompt).toContain('Output only 3 <p> paragraphs')
        expect(systemPrompt).toContain('120-170 words total')
        expect(systemPrompt).toContain('Do not repeat, paraphrase, summarize, or mention the risk-level sentence')
        expect(systemPrompt).toContain('El auditor ha determinado')
        expect(systemPrompt).toContain('Durante el proceso de evaluación de seguridad llevado a cabo sobre el aplicativo,')
        expect(systemPrompt).toContain('During the security assessment conducted on the application,')
        expect(systemPrompt).toContain('Never use more than 5 paragraphs')
        expect(systemPrompt).toContain('Do not enumerate individual vulnerabilities, counts, CVSS scores, endpoints, hosts, tools, or remediation actions')
        expect(systemPrompt).toContain('Ignore the structure of the findings digest as an output format')
        expect(userPrompt).toContain('after the risk-level sentence and before the possible-risk-level legend')
      })

      it('validates the corpus-derived executive summary shape', () => {
        var spanishSample = [
          '<p>Durante el proceso de evaluación de seguridad llevado a cabo sobre el aplicativo, el equipo de pruebas de penetración ha identificado varias vulnerabilidades que, aunque no comprometen directamente máquinas críticas, podrían exponer riesgos significativos. Estas vulnerabilidades, proporcionan información valiosa y posibles puntos de entrada que podrían ser explotados para comprometer la seguridad de la organización.</p>',
          '<p>La gravedad de estas vulnerabilidades radica en que permiten a un atacante potencial obtener información sensible y acceder a datos críticos de la organización. Además, algunas de estas vulnerabilidades facilitan ataques que pueden afectar la disponibilidad y la integridad de los sistemas y datos de la organización.</p>',
          '<p>Este escenario, podría resultar en la exposición de datos confidenciales, interrupciones operativas menores, y la posibilidad de acciones maliciosas con implicaciones significativas para la integridad y reputación de la organización. Esto afecta principalmente la confidencialidad de los datos.</p>'
        ].join('\n')

        var englishSample = [
          '<p>During the security assessment conducted on the application, the penetration testing team identified several vulnerabilities that, although they do not directly compromise critical systems, could expose the organization to significant risks. These vulnerabilities provide valuable information and potential entry points that could be exploited to compromise the organization\'s security.</p>',
          '<p>The severity of these vulnerabilities lies in their potential to allow an attacker to obtain sensitive information and gain access to the organization\'s critical data. Moreover, some of these vulnerabilities facilitate attacks that may affect the availability and integrity of the organization\'s systems and data.</p>',
          '<p>This scenario could result in the exposure of confidential information, minor operational disruptions, and the possibility of malicious actions with significant implications for the integrity and reputation of the organization. The primary impact concerns data confidentiality.</p>'
        ].join('\n')

        function assertExecutiveSummaryShape(html, expectedStart, expectedEndPattern) {
          var paragraphs = html.match(/<p>[\s\S]*?<\/p>/g) || []
          var plain = html.replace(/<[^>]+>/g, ' ')
          var words = plain.trim().split(/\s+/).filter(Boolean)

          expect(paragraphs).toHaveLength(3)
          expect(words.length).toBeGreaterThanOrEqual(120)
          expect(words.length).toBeLessThanOrEqual(170)
          expect(html).not.toMatch(/<(ul|ol|li|h[1-6])\b/i)
          expect(plain).not.toMatch(/CVSS|https?:\/\/|endpoint|host/i)
          expect(paragraphs[0]).toContain(expectedStart)
          expect(paragraphs[2]).toMatch(expectedEndPattern)
        }

        assertExecutiveSummaryShape(
          spanishSample,
          'Durante el proceso de evaluación de seguridad llevado a cabo sobre el aplicativo,',
          /Esto afecta principalmente la confidencialidad de los datos\.<\/p>$/
        )
        assertExecutiveSummaryShape(
          englishSample,
          'During the security assessment conducted on the application,',
          /The primary impact concerns data confidentiality\.<\/p>$/
        )
      })

      it('documents the suffix-only severity summary prompt guardrails', () => {
        var systemPrompt = aiService._getDefaultSystemPrompt('severity-summary')
        var userPrompt = aiService._getDefaultUserPrompt('severity-summary')

        expect(systemPrompt).toContain('Your output is appended immediately after that prefix')
        expect(systemPrompt).toContain('only a noun phrase or compact coordinated noun phrase')
        expect(systemPrompt).toContain('Never start with a number, severity label')
        expect(systemPrompt).toContain('Do not repeat the prefix, severity, count')
        expect(systemPrompt).toContain('Do not add impact analysis, consequences')
        expect(userPrompt).toContain('Return only the continuation to append after the prefix')
      })

      it('normalizes severity summaries to the stored sentence continuation', () => {
        var html = aiService._normalizeSeveritySummaryHtml(
          '<p>2 Informative vulnerabilities were found, related to almacenamiento de código JavaScript mediante subida de archivos sin validación de contenido en documentos PDF y transmisión no cifrada de credenciales de autenticación HTTP Basic a través de cabeceras Authorization. Ambos problemas comparten el patrón de fallos de control de entrada y exposición de información sensible, permitiendo la ejecución remota de scripts maliciosos.</p>',
          {
            severityPrefix: 'Se han detectado 2 vulnerabilidades de severidad informativa,',
            severityCount: 2,
            severity: 'Informative'
          }
        )

        expect(html).toEqual('<p>almacenamiento de código JavaScript mediante subida de archivos sin validación de contenido en documentos PDF y transmisión no cifrada de credenciales de autenticación HTTP Basic a través de cabeceras Authorization.</p>')
        expect(html).not.toContain('2 Informative vulnerabilities were found')
        expect(html).not.toContain('Ambos problemas')
      })

      it('strips local model answer-artifact preludes from severity summaries', () => {
        var html = aiService._normalizeSeveritySummaryHtml(
          '<p>Click to reveal solution almacenamiento de código JavaScript en ficheros PDF y exposición de credenciales en cabeceras HTTP mediante autenticación básica no cifrada</p>',
          {
            severityPrefix: 'Se han detectado 2 vulnerabilidades de severidad informativa,',
            severityCount: 2,
            severity: 'Informative'
          }
        )

        expect(html).toEqual('<p>almacenamiento de código JavaScript en ficheros PDF y exposición de credenciales en cabeceras HTTP mediante autenticación básica no cifrada</p>')
      })
    })

    describe('vision anonymization tests', () => {
      it('appends the configured anonymization prompt only when enabled', () => {
        expect(visionService.buildVisionSystemContent({
          visionSystemPrompt: 'Analyze the evidence.',
          visionAnonymizeLlm: false,
          visionAnonymizationPrompt: 'Hide all targets.'
        })).toEqual('Analyze the evidence.')

        expect(visionService.buildVisionSystemContent({
          visionSystemPrompt: 'Analyze the evidence.',
          visionAnonymizeLlm: true,
          visionAnonymizationPrompt: 'Hide all targets.'
        })).toEqual('Analyze the evidence.\n\nHide all targets.')
      })

      it('applies configurable regex rules in order', () => {
        var result = visionService.anonymizeWithRegex(
          'Contact admin@example.com using token secret-123.',
          [
            { name: 'email', pattern: '[A-Za-z]+@[A-Za-z.]+', flags: 'g', replacement: '[EMAIL]', enabled: true },
            { name: 'token', pattern: 'secret-[0-9]+', flags: 'g', replacement: '[TOKEN]', enabled: true }
          ]
        )

        expect(result).toEqual('Contact [EMAIL] using token [TOKEN].')
      })

      it('skips disabled regex rules', () => {
        var result = visionService.anonymizeWithRegex(
          '192.168.1.10',
          [{ name: 'IP', pattern: '\\d+(?:\\.\\d+){3}', flags: 'g', replacement: '[IP]', enabled: false }]
        )

        expect(result).toEqual('192.168.1.10')
      })

      it('redacts full URLs and standalone IP addresses with the default rules', () => {
        var result = visionService.anonymizeWithRegex(
          'Open https://192.168.1.10:8443/admin?q=test#result, then contact 10.0.0.5, ::1 and 2001:db8::42.'
        )

        expect(result).toEqual(
          'Open [URL_REDACTED], then contact [IP_REDACTED], [IP_REDACTED] and [IP_REDACTED].'
        )
      })

      it('validates malformed regex rules', () => {
        var errors = visionService.validateRegexRules([
          { name: 'broken', pattern: '[', flags: 'gg', replacement: '[X]', enabled: true }
        ])

        expect(errors.length).toBeGreaterThanOrEqual(2)
      })
    })

    describe('report template normalization tests', () => {
      it('allocates generated chart drawing IDs after existing template drawing IDs', () => {
        var zip = new (require('pizzip'))()
        zip.file('word/document.xml',
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
            '<w:body>' +
              '<w:p><w:r><w:drawing><wp:inline><wp:docPr id="10" name="Image 10"/></wp:inline></w:drawing></w:r></w:p>' +
              '<w:p><w:r><w:drawing><wp:inline><wp:docPr id="42" name="Chart 42"/></wp:inline></w:drawing></w:r></w:p>' +
            '</w:body>' +
          '</w:document>'
        )

        reportGenerator._initializeChartDrawingDocPrIds(zip)

        expect(reportGenerator._getNextChartDrawingDocPrId()).toEqual(43)
        expect(reportGenerator._getNextChartDrawingDocPrId()).toEqual(44)
      })

      it('removes accidental whitespace around raw DOCX tags', () => {
        var xml =
          '<w:document><w:body>' +
            '<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>' +
              '<w:r><w:t xml:space="preserve"> </w:t></w:r>' +
              '<w:r><w:t>{@audit.critical_summary | convertHTML}</w:t></w:r>' +
            '</w:p>' +
          '</w:body></w:document>'

        var normalized = reportGenerator._normalizeRawTagParagraphXml(xml)

        expect(normalized).toContain('<w:pPr><w:pStyle w:val="Normal"/></w:pPr>')
        expect(normalized).toContain('<w:t xml:space="preserve">{@audit.critical_summary | convertHTML: \'Normal\'}</w:t>')
        expect(normalized).not.toContain('<w:t xml:space="preserve"> </w:t>')
      })

      it('keeps truly mixed raw DOCX tag paragraphs unchanged', () => {
        var xml =
          '<w:document><w:body>' +
            '<w:p>' +
              '<w:r><w:t>Summary: </w:t></w:r>' +
              '<w:r><w:t>{@finding.references_links}</w:t></w:r>' +
            '</w:p>' +
          '</w:body></w:document>'

        expect(reportGenerator._normalizeRawTagParagraphXml(xml)).toEqual(xml)
      })

      it('splits mixed audit summary raw DOCX tags into separate paragraphs', () => {
        var xml =
          '<w:document><w:body>' +
            '<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>' +
              '<w:r><w:t>Critical summary: </w:t></w:r>' +
              '<w:r><w:t>{@audit.critical_summary | convertHTML}</w:t></w:r>' +
            '</w:p>' +
          '</w:body></w:document>'

        var normalized = reportGenerator._normalizeRawTagParagraphXml(xml)

        expect(normalized).toContain('<w:t xml:space="preserve">Critical summary: </w:t>')
        expect(normalized).toContain('AUTOPWNDOC_MERGE_AUDIT_SUMMARY_0_START')
        expect(normalized).toContain('<w:t xml:space="preserve">{@audit.critical_summary | convertHTML: \'Normal\'}</w:t>')
        expect(normalized).toContain('AUTOPWNDOC_MERGE_AUDIT_SUMMARY_0_END')
        expect((normalized.match(/<w:p>/g) || []).length).toEqual(3)
      })

      it('normalizes audit summary raw DOCX tags split across Word runs', () => {
        var xml =
          '<w:document><w:body>' +
            '<w:p>' +
              '<w:r><w:t xml:space="preserve"> </w:t></w:r>' +
              '<w:r><w:t>{</w:t></w:r>' +
              '<w:r><w:t>@</w:t></w:r>' +
              '<w:r><w:t>audit.</w:t></w:r>' +
              '<w:r><w:t>critical</w:t></w:r>' +
              '<w:r><w:t>_summary | convertHTML}</w:t></w:r>' +
            '</w:p>' +
          '</w:body></w:document>'

        var normalized = reportGenerator._normalizeRawTagParagraphXml(xml)

        expect(normalized).toContain('<w:t xml:space="preserve">{@audit.critical_summary | convertHTML}</w:t>')
        expect(normalized).not.toContain('<w:t>{</w:t>')
        expect(normalized).not.toContain('<w:t>@</w:t>')
      })
    })

    describe('html2ooxml tests', () => {
      it('Simple Paragraph', () => {
        var html = "<p>Paragraph Text</p>"
        var expected = `<w:p><w:r><w:t xml:space="preserve">Paragraph Text</w:t></w:r></w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Text without tag', () => {
        var html = "Paragraph Text"
        var expected = `<w:p><w:r><w:t xml:space="preserve">Paragraph Text</w:t></w:r></w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Bold without wrapping paragraph', () => {
        var html = "<b>Paragraph Bold</b>"
        var expected = "<w:p><w:r><w:t xml:space=\"preserve\"></w:t></w:r></w:p>"
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Bold', () => {
        var html = "<p>Paragraph <b>Bold</b></p>"
        var expected =
        `<w:p>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Paragraph </w:t>`+
          `</w:r>`+
          `<w:r>`+
            `<w:rPr>`+
              `<w:b/>`+
              `<w:bCs/>`+
            `</w:rPr>`+
            `<w:t xml:space="preserve">Bold</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Italic', () => {
        var html = "<p>Paragraph <i>Italic</i></p>"
        var expected =
        `<w:p>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Paragraph </w:t>`+
          `</w:r>`+
          `<w:r>`+
            `<w:rPr>`+
              `<w:i/>`+
              `<w:iCs/>`+
            `</w:rPr>`+
            `<w:t xml:space="preserve">Italic</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Underline', () => {
        var html = "<p>Paragraph <u>Underline</u></p>"
        var expected =
        `<w:p>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Paragraph </w:t>`+
          `</w:r>`+
          `<w:r>`+
            `<w:rPr>`+
              `<w:u w:val="single"/>`+
            `</w:rPr>`+
            `<w:t xml:space="preserve">Underline</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Strike', () => {
        var html = "<p>Paragraph <s>Strike</s></p>"
        var expected =
        `<w:p>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Paragraph </w:t>`+
          `</w:r>`+
          `<w:r>`+
            `<w:rPr>`+
              `<w:strike/>`+
            `</w:rPr>`+
            `<w:t xml:space="preserve">Strike</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Bold and Italics', () => {
        var html = "<p>Paragraph <b><i>Mark</i></b></p>"
        var expected =
        `<w:p>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Paragraph </w:t>`+
          `</w:r>`+
          `<w:r>`+
            `<w:rPr>`+
              `<w:b/>`+
              `<w:bCs/>`+
              `<w:i/>`+
              `<w:iCs/>`+
            `</w:rPr>`+
            `<w:t xml:space="preserve">Mark</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('All marks', () => {
        var html = "<p>Paragraph <b><i><u><s>Mark</s></u></i></b></p>"
        var expected =
        `<w:p>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Paragraph </w:t>`+
          `</w:r>`+
          `<w:r>`+
            `<w:rPr>`+
              `<w:b/>`+
              `<w:bCs/>`+
              `<w:i/>`+
              `<w:iCs/>`+
              `<w:u w:val="single"/>`+
              `<w:strike/>`+
            `</w:rPr>`+
            `<w:t xml:space="preserve">Mark</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Heading 1', () => {
        var html = "<h1>Heading</h1>"
        var expected =
        `<w:p>`+
          `<w:pPr>`+
            `<w:pStyle w:val="Heading1"/>`+
          `</w:pPr>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Heading</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Heading 2', () => {
        var html = "<h2>Heading</h2>"
        var expected =
        `<w:p>`+
          `<w:pPr>`+
            `<w:pStyle w:val="Heading2"/>`+
          `</w:pPr>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Heading</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Heading 3', () => {
        var html = "<h3>Heading</h3>"
        var expected =
        `<w:p>`+
          `<w:pPr>`+
            `<w:pStyle w:val="Heading3"/>`+
          `</w:pPr>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Heading</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Heading 4', () => {
        var html = "<h4>Heading</h4>"
        var expected =
        `<w:p>`+
          `<w:pPr>`+
            `<w:pStyle w:val="Heading4"/>`+
          `</w:pPr>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Heading</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Heading 5', () => {
        var html = "<h5>Heading</h5>"
        var expected =
        `<w:p>`+
          `<w:pPr>`+
            `<w:pStyle w:val="Heading5"/>`+
          `</w:pPr>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Heading</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Heading 6', () => {
        var html = "<h6>Heading</h6>"
        var expected =
        `<w:p>`+
          `<w:pPr>`+
            `<w:pStyle w:val="Heading6"/>`+
          `</w:pPr>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Heading</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Simple Bullets', () => {
        var html = 
        `<ul>`+
          `<li>`+
            `<p>Bullet1</p>`+
          `</li>`+
          `<li>`+
            `<p>Bullet2</p>`+
          `</li>`+
        `</ul>`
        var expected =
        `<w:p>`+
          `<w:pPr>`+
            `<w:pStyle w:val="ListParagraph"/>`+
            `<w:numPr>`+
              `<w:ilvl w:val="0"/>`+
              `<w:numId w:val="0"/>`+
            `</w:numPr>`+
          `</w:pPr>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Bullet1</w:t>`+
          `</w:r>`+
        `</w:p>`+
        `<w:p>`+
          `<w:pPr>`+
            `<w:pStyle w:val="ListParagraph"/>`+
            `<w:numPr>`+
              `<w:ilvl w:val="0"/>`+
              `<w:numId w:val="0"/>`+
            `</w:numPr>`+
          `</w:pPr>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Bullet2</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Simple Bullets without ul tag', () => {
        var html = 
        `<li>`+
          `<p>Bullet1</p>`+
        `</li>`+
        `<li>`+
          `<p>Bullet2</p>`+
        `</li>`
        var expected =
        `<w:p>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Bullet1</w:t>`+
          `</w:r>`+
        `</w:p>`+
        `<w:p>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Bullet2</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Nested Bullets', () => {
        var html =
        `<ul>`+
          `<li>`+
            `<p>Bullet1</p>`+
          `</li>`+
          `<ul>`+
            `<li>`+
              `<p>BulletNested</p>`+
            `</li>`+
          `</ul>`+
          `<li>`+
            `<p>Bullet2</p>`+
          `</li>`+
        `</ul>`
        var expected = 
        `<w:p>`+
          `<w:pPr>`+
            `<w:pStyle w:val="ListParagraph"/>`+
            `<w:numPr>`+
              `<w:ilvl w:val="0"/>`+
              `<w:numId w:val="0"/>`+
            `</w:numPr>`+
          `</w:pPr>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Bullet1</w:t>`+
          `</w:r>`+
        `</w:p>`+
        `<w:p>`+
          `<w:pPr>`+
            `<w:pStyle w:val="ListParagraph"/>`+
            `<w:numPr>`+
              `<w:ilvl w:val="1"/>`+
              `<w:numId w:val="0"/>`+
            `</w:numPr>`+
          `</w:pPr>`+
          `<w:r>`+
            `<w:t xml:space="preserve">BulletNested</w:t>`+
          `</w:r>`+
        `</w:p>`+
        `<w:p>`+
          `<w:pPr>`+
            `<w:pStyle w:val="ListParagraph"/>`+
            `<w:numPr>`+
              `<w:ilvl w:val="0"/>`+
              `<w:numId w:val="0"/>`+
            `</w:numPr>`+
          `</w:pPr>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Bullet2</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Simple Numbering', () => {
        var html =
        `<ol>`+
          `<li>`+
            `<p>Number1</p>`+
          `</li>`+
          `<li>`+
            `<p>Number2</p>`+
          `</li>`+
        `</ol>`
        var expected =
        `<w:p>`+
          `<w:pPr>`+
            `<w:pStyle w:val="ListParagraph"/>`+
            `<w:numPr>`+
              `<w:ilvl w:val="0"/>`+
              `<w:numId w:val="0"/>`+
            `</w:numPr>`+
          `</w:pPr>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Number1</w:t>`+
          `</w:r>`+
        `</w:p>`+
        `<w:p>`+
          `<w:pPr>`+
            `<w:pStyle w:val="ListParagraph"/>`+
            `<w:numPr>`+
              `<w:ilvl w:val="0"/>`+
              `<w:numId w:val="0"/>`+
            `</w:numPr>`+
          `</w:pPr>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Number2</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Nested Numbering', () => {
        var html =
        `<ol>`+
          `<li>`+
            `<p>Number1</p>`+
          `</li>`+
          `<ol>`+
            `<li>`+
              `<p>NumberNested</p>`+
            `</li>`+
          `</ol>`+
          `<li>`+
            `<p>Number2</p>`+
          `</li>`+
        `</ol>`
        var expected =
        `<w:p>`+
          `<w:pPr>`+
            `<w:pStyle w:val="ListParagraph"/>`+
            `<w:numPr>`+
              `<w:ilvl w:val="0"/>`+
              `<w:numId w:val="0"/>`+
            `</w:numPr>`+
          `</w:pPr>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Number1</w:t>`+
          `</w:r>`+
        `</w:p>`+
        `<w:p>`+
          `<w:pPr>`+
            `<w:pStyle w:val="ListParagraph"/>`+
            `<w:numPr>`+
              `<w:ilvl w:val="1"/>`+
              `<w:numId w:val="0"/>`+
            `</w:numPr>`+
          `</w:pPr>`+
          `<w:r>`+
            `<w:t xml:space="preserve">NumberNested</w:t>`+
          `</w:r>`+
        `</w:p>`+
        `<w:p>`+
          `<w:pPr>`+
            `<w:pStyle w:val="ListParagraph"/>`+
            `<w:numPr>`+
              `<w:ilvl w:val="0"/>`+
              `<w:numId w:val="0"/>`+
            `</w:numPr>`+
          `</w:pPr>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Number2</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Break', () => {
        var html = "<p>Paragraph<br>Break</p>"
        var expected =
        `<w:p>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Paragraph</w:t>`+
          `</w:r>`+
          `<w:r>`+
            `<w:br/>`+
          `</w:r>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Break</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Break with newline', () => {
        var html = "<p>Paragraph\nBreak</p>"
        var expected =
        `<w:p>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Paragraph</w:t>`+
          `</w:r>`+
          `<w:r>`+
            `<w:br/>`+
          `</w:r>`+
          `<w:r>`+
            `<w:t xml:space="preserve">Break</w:t>`+
          `</w:r>`+
        `</w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('Code', () => {
        var html = "<p>Paragraph <code>Code</code> Paragraph</p>"
        var expected =
        `<w:p><w:r><w:t xml:space=\"preserve\">Paragraph </w:t></w:r><w:r><w:rPr><w:rStyle w:val=\"CodeChar\"/></w:rPr><w:t xml:space=\"preserve\">Code</w:t></w:r><w:r><w:t xml:space=\"preserve\"> Paragraph</w:t></w:r></w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

      it('CodeBlock', () => {
        var html = "<pre><code>Code Block</code></pre>"
        var expected =
        `<w:p><w:pPr><w:pStyle w:val=\"Code\"/></w:pPr><w:r><w:t xml:space=\"preserve\">Code Block</w:t></w:r></w:p>`
        var ooxml = html2ooxml(html).replace(/w:numId w:val="\d+"/g, 'w:numId w:val="0"')
        expect(ooxml).toEqual(expected)
      })

    })
  })
}
