
var chartGenerator = {};

const encodeHTMLEntities = s => s.replace(/[\u00A0-\u9999<>&]/g, i => '&#'+i.charCodeAt(0)+';')

// Returns XML corresponding to a pieChart
chartGenerator.generatePieChart = function (title, colorCrit, colorHigh, colorMed, colorLow, countCritical, countHigh, countMedium, countLow, translate){
  
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
                    xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <c:chart>
        <c:title>
            <c:tx>
                <c:rich>
                <a:bodyPr/>
                <a:lstStyle/>
                <a:p>
                    <a:pPr>
                    <a:defRPr sz="1600"/>
                    </a:pPr>
                    <a:r>
                    <a:rPr sz="1600"/>
                    <a:t>${encodeHTMLEntities(title)}</a:t>
                    </a:r>
                </a:p>
                </c:rich>
            </c:tx>
            <c:layout/>
            <c:overlay val="0"/>
            </c:title>
            <c:plotArea>
            <c:layout>
            <c:manualLayout>
                <c:layoutTarget val="inner"/>
                <c:xMode val="edge"/>
                <c:yMode val="edge"/>
                <c:w val="0.8"/>  
                <c:h val="0.8"/> 
            </c:manualLayout>
        </c:layout>
            <c:pieChart>
                <c:ser>
                <c:idx val="0"/>
                <c:order val="0"/>
                <c:tx>
                    <c:strRef>
                    <c:strCache>
                        <c:ptCount val="4"/>
                        <c:pt idx="0">
                        <c:v>${translate("Critical")}</c:v>
                        </c:pt>
                        <c:pt idx="1">
                        <c:v>${translate("High")}</c:v>
                        </c:pt>
                        <c:pt idx="2">
                        <c:v>${translate("Medium")}</c:v>
                        </c:pt>
                        <c:pt idx="3">
                        <c:v>${translate("Low")}</c:v>
                        </c:pt>
                    </c:strCache>
                    </c:strRef>
                </c:tx>
                <c:val>
                    <c:numLit>
                    <c:formatCode>General</c:formatCode>
                    <c:ptCount val="4"/>
                    <c:pt idx="0">
                        <c:v>${countCritical}</c:v>
                    </c:pt>
                    <c:pt idx="1">
                        <c:v>${countHigh}</c:v>
                    </c:pt>
                    <c:pt idx="2">
                        <c:v>${countMedium}</c:v>
                    </c:pt>
                    <c:pt idx="3">
                        <c:v>${countLow}</c:v>
                    </c:pt>
                    </c:numLit>
                </c:val>
                <c:cat>
                <c:strRef>
                <c:strCache>
                    <c:ptCount val="4"/>
                    <c:pt idx="0">
                    <c:v>${translate("Critical")}</c:v>
                    </c:pt>
                    <c:pt idx="1">
                    <c:v>${translate("High")}</c:v>
                    </c:pt>
                    <c:pt idx="2">
                    <c:v>${translate("Medium")}</c:v>
                    </c:pt>
                    <c:pt idx="3">
                    <c:v>${translate("Low")}</c:v>
                    </c:pt>
                </c:strCache>
                </c:strRef>
            </c:cat>
                 <c:dPt>
                <c:idx val="0"/>
                <c:spPr>
                    <a:solidFill>
                        <a:srgbClr val="${encodeHTMLEntities(colorCrit)}"/>
                    </a:solidFill>
                </c:spPr>
            </c:dPt>
            <c:dPt>
                <c:idx val="1"/>
                <c:spPr>
                    <a:solidFill>
                        <a:srgbClr val="${encodeHTMLEntities(colorHigh)}"/>
                    </a:solidFill>
                </c:spPr>
            </c:dPt>
            <c:dPt>
                <c:idx val="2"/>
                <c:spPr>
                    <a:solidFill>
                        <a:srgbClr val="${encodeHTMLEntities(colorMed)}"/>
                    </a:solidFill>
                </c:spPr>
            </c:dPt>
            <c:dPt>
                <c:idx val="3"/>
                <c:spPr>
                    <a:solidFill>
                        <a:srgbClr val="${encodeHTMLEntities(colorLow)}"/>
                    </a:solidFill>
                </c:spPr>
            </c:dPt>
                </c:ser>
                <c:dLbls>
                <c:showLegendKey val="0"/>
                <c:showVal val="1"/>
                <c:showCatName val="0"/>
                <c:showSerName val="0"/>
                <c:showPercent val="0"/>
                <c:showBubbleSize val="0"/>
                <c:showLeaderLines val="0"/>
                <c:txPr>
            <a:bodyPr/>
            <a:lstStyle/>
            <a:p>
                <a:pPr>
                    <a:defRPr sz="1500" b="1">
                        <a:solidFill>
                            <a:srgbClr val="FFFFFF"/>
                        </a:solidFill>
                    </a:defRPr>
                </a:pPr>
            </a:p>
        </c:txPr>
                </c:dLbls>
            </c:pieChart>
            </c:plotArea>
            <c:legend>
            <c:legendPos val="r"/>
            <c:overlay val="0"/>
            <c:spPr>
                <a:noFill/>
                <a:ln>
                <a:noFill/>
                </a:ln>
                <a:effectLst/>
            </c:spPr>
            <c:txPr>
                <a:bodyPr rot="0" spcFirstLastPara="1" vertOverflow="ellipsis" vert="horz" wrap="square" anchor="ctr" anchorCtr="1"/>
                <a:lstStyle/>
                <a:p>
                <a:pPr>
                    <a:defRPr sz="1500" b="0" i="0" u="none" strike="noStrike" kern="1200" baseline="0">
                    <a:solidFill>
                        <a:schemeClr val="tx1">
                        <a:lumMod val="65000"/>
                        <a:lumOff val="35000"/>
                        </a:schemeClr>
                    </a:solidFill>
                    <a:latin typeface="+mn-lt"/>
                    <a:ea typeface="+mn-ea"/>
                    <a:cs typeface="+mn-cs"/>
                    </a:defRPr>
                </a:pPr>
                <a:endParaRPr lang="en-US"/>
                </a:p>
            </c:txPr>
            </c:legend>
            <c:plotVisOnly val="1"/>
            <c:dispBlanksAs val="gap"/>
            <c:showDLblsOverMax val="0"/>
        </c:chart>
        <c:spPr>
            <a:noFill/>
            <a:ln>
            <a:noFill/>
            </a:ln>
            <a:effectLst/>
        </c:spPr>
        </c:chartSpace>
        `;
}

function barPointColorsXml(colors) {
    if (!Array.isArray(colors) || colors.length === 0) return '';
    return colors.map((color, index) => `<c:dPt>
        <c:idx val="${index}"/>
        <c:spPr>
            <a:solidFill><a:srgbClr val="${encodeHTMLEntities(color)}"/></a:solidFill>
            <a:ln w="19050"><a:solidFill><a:srgbClr val="${encodeHTMLEntities(color)}"/></a:solidFill></a:ln>
            <a:effectLst/>
        </c:spPr>
    </c:dPt>`).join('');
}

// Returns XML corresponding to a barChart 
chartGenerator.generateBarChart = function(title, barColor, legendXML, valueXML, labelSize, labelColor, barColors, dataLabels, titleColor){
   const pointColorsXml = barPointColorsXml(barColors);
   const dataLabelsConfig = dataLabels || {};
   const resolvedTitleColor = titleColor || '000000';
   const barDataLabelsXml = dataLabelsXml(
        dataLabelsConfig.items || [],
        dataLabelsConfig.mode || 'value',
        dataLabelsConfig.size || 10,
        dataLabelsConfig.color || '000000',
        dataLabelsConfig.bold || false,
        { forceCustomPercent: true }
   );

   return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c16r2="http://schemas.microsoft.com/office/drawing/2015/06/chart">
  <c:date1904 val="0"/>
  <c:chart>
   <c:title>
        <c:tx>
            <c:rich>
            <a:bodyPr/>
            <a:lstStyle/>
            <a:p>
                <a:pPr>
                <a:defRPr sz="1600">
                    <a:solidFill><a:srgbClr val="${encodeHTMLEntities(resolvedTitleColor)}"/></a:solidFill>
                </a:defRPr>
                </a:pPr>
                <a:r>
                <a:rPr sz="1600">
                    <a:solidFill><a:srgbClr val="${encodeHTMLEntities(resolvedTitleColor)}"/></a:solidFill>
                </a:rPr>
                <a:t>${encodeHTMLEntities(title)}</a:t>
                </a:r>
            </a:p>
            </c:rich>
        </c:tx>
        <c:layout/>
        <c:overlay val="0"/>
        </c:title>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx>
            <c:strRef>
              <c:strCache>
                <c:ptCount val="1"/>
                <c:pt idx="0">
                  <c:v></c:v>
                </c:pt>
              </c:strCache>
            </c:strRef>
          </c:tx>
         <c:spPr>
            <a:solidFill>
                <a:srgbClr val="${encodeHTMLEntities(barColor)}"/>
            </a:solidFill>
            <a:ln w="19050">
                <a:solidFill>
                <a:srgbClr val="${encodeHTMLEntities(barColor)}"/>
                </a:solidFill>
            </a:ln>
            <a:effectLst/>
         </c:spPr>
          <c:invertIfNegative val="0"/>
          <c:cat>
            <c:strRef>
              <c:strCache>
                ${legendXML}
              </c:strCache>
            </c:strRef>
          </c:cat>
          <c:val>
            <c:numRef>
              <c:numCache>
                <c:formatCode>General</c:formatCode>
               ${valueXML}
              </c:numCache>
            </c:numRef>
          </c:val>
          ${pointColorsXml}
        </c:ser>
       ${barDataLabelsXml}
        <c:gapWidth val="100"/>
        <c:axId val="568377344"/>
        <c:axId val="568375904"/>
      </c:barChart>
<c:catAx>
  <c:axId val="568377344"/>
  <c:scaling>
    <c:orientation val="minMax"/>
  </c:scaling>
  <c:delete val="0"/> 
  <c:axPos val="b"/> 
  <c:numFmt formatCode="General" sourceLinked="1"/>
  <c:majorTickMark val="out"/>
  <c:minorTickMark val="none"/>
  <c:tickLblPos val="nextTo"/>  
  <c:spPr>
    <a:noFill/>
    <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr">
      <a:solidFill>
        <a:schemeClr val="tx1">
          <a:lumMod val="15000"/>
          <a:lumOff val="85000"/>
        </a:schemeClr>
      </a:solidFill>
      <a:round/>
    </a:ln>
    <a:effectLst/>
  </c:spPr>
  <c:txPr>
    <a:bodyPr rot="0" spcFirstLastPara="1" vertOverflow="ellipsis" vert="horz" wrap="square" anchor="ctr" anchorCtr="1"/>
    <a:lstStyle/>
    <a:p>
      <a:pPr>
        <a:defRPr sz="${encodeHTMLEntities(labelSize.toString())}" b="0">
          <a:solidFill>
            <a:srgbClr val="${encodeHTMLEntities(labelColor)}"/>
          </a:solidFill>
        </a:defRPr>
      </a:pPr>
      <a:endParaRPr lang="en-US"/>
    </a:p>
  </c:txPr>
  <c:crossAx val="568375904"/>
  <c:crosses val="autoZero"/>
  <c:auto val="1"/>
  <c:lblAlgn val="ctr"/>
  <c:lblOffset val="100"/>
  <c:noMultiLvlLbl val="0"/>
</c:catAx>
      <c:valAx>
        <c:axId val="568375904"/>
        <c:scaling>
          <c:orientation val="minMax"/>
        </c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:majorGridlines>
          <c:spPr>
            <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr">
              <a:solidFill>
                <a:schemeClr val="tx1">
                  <a:lumMod val="15000"/>
                  <a:lumOff val="85000"/>
                  <a:srgbClr val="555555"/> 
                </a:schemeClr>
              </a:solidFill>
              <a:round/>
            </a:ln>
            <a:effectLst/>
          </c:spPr>
        </c:majorGridlines>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="none"/>
        <c:spPr>
          <a:noFill/>
          <a:ln>
            <a:noFill/>
          </a:ln>
          <a:effectLst/>
        </c:spPr>
        <c:txPr>
          <a:bodyPr rot="-60000000" spcFirstLastPara="1" vertOverflow="ellipsis" vert="horz" wrap="square" anchor="ctr" anchorCtr="1"/>
          <a:lstStyle/>
          <a:p>
            <a:pPr>
              <a:defRPr sz="900" b="0" i="0" u="none" strike="noStrike" kern="1200" baseline="0">
                <a:solidFill>
                  <a:schemeClr val="tx1">
                    <a:lumMod val="65000"/>
                    <a:lumOff val="35000"/>
                  </a:schemeClr>
                </a:solidFill>
                <a:latin typeface="+mn-lt"/>
                <a:ea typeface="+mn-ea"/>
                <a:cs typeface="+mn-cs"/>
              </a:defRPr>
            </a:pPr>
            <a:endParaRPr lang="en-US"/>
          </a:p>
        </c:txPr>
        <c:crossAx val="568377344"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="between"/>
      </c:valAx>
      <c:spPr>
        <a:noFill/>
        <a:ln>
          <a:noFill/>
        </a:ln>
        <a:effectLst/>
      </c:spPr>
    </c:plotArea>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
    <c:extLst>
      <c:ext xmlns:c16r3="http://schemas.microsoft.com/office/drawing/2017/03/chart" uri="{56B9EC1D-385E-4148-901F-78D8002777C0}">
        <c16r3:dataDisplayOptions16>
          <c16r3:dispNaAsBlank val="1"/>
        </c16r3:dataDisplayOptions16>
      </c:ext>
    </c:extLst>
    <c:showDLblsOverMax val="0"/>
  </c:chart>
  <c:spPr>
  <a:noFill/>
  <a:ln>
    <a:noFill/>
  </a:ln>
  <a:effectLst/>
</c:spPr>
  <c:txPr>
    <a:bodyPr/>
    <a:lstStyle/>
    <a:p>
      <a:pPr>
        <a:defRPr/>
      </a:pPr>
      <a:endParaRPr lang="en-US"/>
    </a:p>
  </c:txPr>
</c:chartSpace>
    `;
}

function fontXml(size, color, bold) {
    return `<c:txPr>
        <a:bodyPr/>
        <a:lstStyle/>
        <a:p>
            <a:pPr>
                <a:defRPr sz="${encodeHTMLEntities(String(size * 100))}" b="${bold ? 1 : 0}">
                    <a:solidFill><a:srgbClr val="${encodeHTMLEntities(color)}"/></a:solidFill>
                </a:defRPr>
            </a:pPr>
        </a:p>
    </c:txPr>`;
}

function shapeXml(theme) {
    const fill = theme.plotAreaFill && theme.plotAreaFill !== 'none'
        ? `<a:solidFill><a:srgbClr val="${encodeHTMLEntities(theme.plotAreaFill)}"/></a:solidFill>`
        : '<a:noFill/>';
    const line = theme.borderEnabled && theme.borderWidth > 0
        ? `<a:ln w="${Math.round(theme.borderWidth * 12700)}"><a:solidFill><a:srgbClr val="${encodeHTMLEntities(theme.borderColor)}"/></a:solidFill></a:ln>`
        : '<a:ln><a:noFill/></a:ln>';
    return `<c:spPr>${fill}${line}<a:effectLst/></c:spPr>`;
}

function dataLabelFlags(mode) {
    return {
        showVal: mode === 'value' || mode === 'both' ? 1 : 0,
        showPercent: mode === 'percent' || mode === 'both' ? 1 : 0,
    };
}

function dataLabelNumberFormat(mode) {
    return mode === 'percent' || mode === 'both'
        ? '<c:numFmt formatCode="0%" sourceLinked="0"/>'
        : '';
}

function percentText(value, total) {
    if (!total) return '0%';
    return `${Math.round((value / total) * 100)}%`;
}

function customDataLabelXml(index, text, size, color, bold) {
    return `<c:dLbl>
        <c:idx val="${index}"/>
        <c:tx>
            <c:rich>
                <a:bodyPr/>
                <a:lstStyle/>
                <a:p>
                    <a:r>
                        <a:rPr sz="${encodeHTMLEntities(String(size * 100))}" b="${bold ? 1 : 0}">
                            <a:solidFill><a:srgbClr val="${encodeHTMLEntities(color)}"/></a:solidFill>
                        </a:rPr>
                        <a:t>${encodeHTMLEntities(text)}</a:t>
                    </a:r>
                </a:p>
            </c:rich>
        </c:tx>
        <c:showLegendKey val="0"/>
        <c:showVal val="0"/>
        <c:showCatName val="0"/>
        <c:showSerName val="0"/>
        <c:showPercent val="0"/>
        <c:showBubbleSize val="0"/>
        <c:showLeaderLines val="0"/>
    </c:dLbl>`;
}

function dataLabelsXml(items, mode, size, color, bold, options = {}) {
    if (mode === 'none') return '';

    const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
    const customLabels = mode === 'both' || (mode === 'percent' && options.forceCustomPercent);
    const customXml = customLabels
        ? items.map((item, index) => {
            const text = mode === 'both'
                ? `${item.value} (${percentText(item.value, total)})`
                : percentText(item.value, total);
            return customDataLabelXml(index, text, size, color, bold);
        }).join('')
        : '';
    const labels = customLabels ? { showVal: 0, showPercent: 0 } : dataLabelFlags(mode);

    return `<c:dLbls>
        ${customXml}
        <c:showLegendKey val="0"/>
        ${dataLabelNumberFormat(mode)}
        <c:showVal val="${labels.showVal}"/>
        <c:showCatName val="0"/>
        <c:showSerName val="0"/>
        <c:showPercent val="${labels.showPercent}"/>
        <c:showBubbleSize val="0"/>
        <c:showLeaderLines val="0"/>
        ${fontXml(size, color, bold)}
    </c:dLbls>`;
}

function pieSliceShapeXml(color) {
    return `<c:spPr>
        <a:solidFill><a:srgbClr val="${encodeHTMLEntities(color)}"/></a:solidFill>
        <a:ln><a:noFill/></a:ln>
        <a:effectLst>
            <a:softEdge rad="38100"/>
        </a:effectLst>
    </c:spPr>`;
}

// Returns XML corresponding to a native editable 3D pieChart.
chartGenerator.generatePie3DChart = function({ title, severities, theme }) {
    const labelsXml = severities.map((item, index) => `<c:pt idx="${index}"><c:v>${encodeHTMLEntities(item.label)}</c:v></c:pt>`).join('');
    const valuesXml = severities.map((item, index) => `<c:pt idx="${index}"><c:v>${encodeHTMLEntities(String(item.value))}</c:v></c:pt>`).join('');
    const colorsXml = severities.map((item, index) => `<c:dPt><c:idx val="${index}"/>${pieSliceShapeXml(item.color)}</c:dPt>`).join('');
    const dataLabelsXmlForPie = dataLabelsXml(
        severities,
        theme.dataLabelMode,
        theme.dataLabelSize,
        theme.dataLabelColor,
        theme.dataLabelBold
    );

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <c:chart>
        <c:title>
            <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="${encodeHTMLEntities(String(theme.titleSize * 100))}" b="${theme.titleBold ? 1 : 0}"><a:solidFill><a:srgbClr val="${encodeHTMLEntities(theme.titleColor)}"/></a:solidFill></a:rPr><a:t>${encodeHTMLEntities(title)}</a:t></a:r></a:p></c:rich></c:tx>
            <c:layout/>
            <c:overlay val="0"/>
        </c:title>
        <c:view3D>
            <c:rotX val="${encodeHTMLEntities(String(theme.view3DRotX))}"/>
            <c:rotY val="${encodeHTMLEntities(String(theme.view3DRotY))}"/>
            <c:rAngAx val="${theme.view3DRightAngleAxes ? 1 : 0}"/>
            <c:perspective val="${encodeHTMLEntities(String(theme.view3DPerspective))}"/>
        </c:view3D>
        <c:plotArea>
            <c:layout/>
            <c:pie3DChart>
                <c:varyColors val="0"/>
                <c:ser>
                    <c:idx val="0"/>
                    <c:order val="0"/>
                    <c:tx><c:strRef><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${encodeHTMLEntities(title)}</c:v></c:pt></c:strCache></c:strRef></c:tx>
                    <c:cat><c:strRef><c:strCache><c:ptCount val="${severities.length}"/>${labelsXml}</c:strCache></c:strRef></c:cat>
                    <c:val><c:numRef><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${severities.length}"/>${valuesXml}</c:numCache></c:numRef></c:val>
                    ${colorsXml}
                </c:ser>
                ${dataLabelsXmlForPie}
                <c:firstSliceAng val="270"/>
            </c:pie3DChart>
            ${shapeXml(theme)}
        </c:plotArea>
        <c:legend>
            <c:legendPos val="${encodeHTMLEntities(theme.legendPosition)}"/>
            <c:overlay val="0"/>
            ${fontXml(theme.legendSize, theme.legendColor, false)}
        </c:legend>
        <c:plotVisOnly val="1"/>
        <c:dispBlanksAs val="gap"/>
        <c:showDLblsOverMax val="0"/>
    </c:chart>
    ${shapeXml(theme)}
</c:chartSpace>`;
}

module.exports = chartGenerator;
