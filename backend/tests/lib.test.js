module.exports = function () {
  var html2ooxml = require("../src/lib/html2ooxml")
  var utils = require("../src/lib/utils")
  var chartGenerator = require("../src/lib/chart-generator")
  var reportGenerator = require("../src/lib/report-generator")
  var translateService = require("../src/lib/translate-service")

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
