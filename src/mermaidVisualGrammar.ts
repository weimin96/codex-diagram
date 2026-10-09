import type { MermaidConfig } from 'mermaid'
import type { MermaidDiagramType } from './types.js'

export interface MermaidVisualPalette {
  background: string
  surface: string
  raised: string
  muted: string
  text: string
  secondaryText: string
  border: string
  strongBorder: string
  accent: string
  success: string
  warning: string
  danger: string
}

export type MermaidVisualDensity = 'comfortable' | 'compact' | 'dense'

export function resolveMermaidVisualDensity(type: MermaidDiagramType | 'unknown', source: string): MermaidVisualDensity {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('%%'))
  if (type === 'flowchart') {
    const decisions = lines.filter((line) => /\w+\s*\{[^}]+\}/.test(line)).length
    const relations = lines.filter((line) => /-->|---|==>|-.->/.test(line)).length
    const groups = lines.filter((line) => /^subgraph\b/i.test(line)).length
    if (decisions >= 5 || relations > 18 || groups >= 4) return 'dense'
    if (decisions >= 3 || relations > 11 || groups >= 2) return 'compact'
    if (lines.length > 24) return 'compact'
    return 'comfortable'
  }
  if (type === 'sequence') {
    const participants = lines.filter((line) => /^(participant|actor)\b/i.test(line)).length
    const messages = lines.filter((line) => /(?:--?>>|--?>|--?x|--?\)|--?\])/.test(line)).length
    if (participants > 9 || messages > 28) return 'dense'
    if (participants > 6 || messages > 16) return 'compact'
    return 'comfortable'
  }
  if (type === 'er') {
    const entities = lines.filter((line) => /\{\s*$/.test(line)).length
    if (entities > 16) return 'dense'
    if (entities > 9) return 'compact'
    return 'comfortable'
  }
  if (type === 'mindmap') {
    const nodes = Math.max(0, lines.length - 1)
    if (nodes > 55) return 'dense'
    if (nodes > 28) return 'compact'
    return 'comfortable'
  }
  if (type === 'state' || type === 'class') {
    if (lines.length > 46) return 'dense'
    if (lines.length > 24) return 'compact'
    return 'comfortable'
  }
  if (type === 'kanban') {
    const cards = lines.filter((line) => /^\w+\[/.test(line)).length
    if (cards > 28) return 'dense'
    if (cards > 16) return 'compact'
    return 'comfortable'
  }
  if (type === 'requirement') {
    const items = lines.filter((line) => /^(requirement|functionalRequirement|interfaceRequirement|performanceRequirement|physicalRequirement|designConstraint|element)\b/.test(line)).length
    if (items > 20) return 'dense'
    if (items > 11) return 'compact'
    return 'comfortable'
  }
  if (type === 'sankey') {
    const flows = Math.max(0, lines.length - 1)
    if (flows > 28) return 'dense'
    if (flows > 16) return 'compact'
    return 'comfortable'
  }
  if (type === 'radar') {
    const curves = lines.filter((line) => /^curve\b/i.test(line)).length
    if (curves > 4) return 'dense'
    if (curves > 2) return 'compact'
    return 'comfortable'
  }
  if (type === 'treemap' || type === 'ishikawa') {
    if (lines.length > 32) return 'dense'
    if (lines.length > 18) return 'compact'
    return 'comfortable'
  }
  if (lines.length > 42) return 'dense'
  if (lines.length > 22) return 'compact'
  return 'comfortable'
}

export function mermaidVisualConfig(type: MermaidDiagramType | 'unknown', palette: MermaidVisualPalette, source = ''): MermaidConfig {
  const density = resolveMermaidVisualDensity(type, source)
  const nodeSpacing = density === 'comfortable' ? 38 : density === 'compact' ? 30 : 24
  const rankSpacing = density === 'comfortable' ? 58 : density === 'compact' ? 48 : 40
  const flowchartRankSpacing = density === 'comfortable' ? 54 : density === 'compact' ? 42 : 32
  const actorMargin = density === 'comfortable' ? 72 : density === 'compact' ? 58 : 46
  const messageMargin = density === 'comfortable' ? 34 : density === 'compact' ? 29 : 24
  const entityPadding = density === 'comfortable' ? 12 : density === 'compact' ? 10 : 8
  const themeVariables = {
    fontSize: '13px',
    fontWeight: '500',
    radius: 8,
    strokeWidth: '1px',
    dropShadow: 'none',
    background: palette.background,
    primaryColor: palette.raised,
    primaryTextColor: palette.text,
    primaryBorderColor: palette.strongBorder,
    secondaryColor: palette.muted,
    secondaryTextColor: palette.text,
    secondaryBorderColor: palette.border,
    tertiaryColor: palette.surface,
    tertiaryTextColor: palette.text,
    tertiaryBorderColor: palette.border,
    lineColor: palette.secondaryText,
    arrowheadColor: palette.secondaryText,
    textColor: palette.text,
    titleColor: palette.text,
    edgeLabelBackground: palette.surface,
    nodeBkg: palette.raised,
    nodeBorder: palette.strongBorder,
    nodeTextColor: palette.text,
    clusterBkg: palette.surface,
    clusterBorder: palette.border,
    actorBkg: palette.raised,
    actorBorder: palette.strongBorder,
    actorTextColor: palette.text,
    actorLineColor: palette.border,
    signalColor: palette.secondaryText,
    signalTextColor: palette.text,
    labelBoxBkgColor: palette.surface,
    labelBoxBorderColor: palette.border,
    labelTextColor: palette.text,
    loopTextColor: palette.text,
    activationBkgColor: palette.muted,
    activationBorderColor: palette.accent,
    noteBkgColor: palette.surface,
    noteBorderColor: palette.border,
    noteTextColor: palette.text,
    transitionColor: palette.secondaryText,
    transitionLabelColor: palette.text,
    stateLabelColor: palette.text,
    stateBkg: palette.raised,
    compositeBackground: palette.surface,
    compositeBorder: palette.border,
    compositeTitleBackground: palette.muted,
    specialStateColor: palette.accent,
    rowOdd: palette.raised,
    rowEven: palette.surface,
    relationColor: palette.secondaryText,
    relationLabelBackground: palette.surface,
    relationLabelColor: palette.text,
    sectionBkgColor: palette.surface,
    sectionBkgColor2: palette.raised,
    altSectionBkgColor: palette.muted,
    taskBkgColor: palette.raised,
    taskBorderColor: palette.strongBorder,
    activeTaskBkgColor: palette.accent,
    activeTaskBorderColor: palette.accent,
    doneTaskBkgColor: palette.muted,
    doneTaskBorderColor: palette.border,
    critBkgColor: palette.danger,
    critBorderColor: palette.danger,
    gridColor: palette.border,
    todayLineColor: palette.warning,
    taskTextColor: palette.text,
    taskTextOutsideColor: palette.text,
    quadrant1Fill: palette.muted,
    quadrant2Fill: palette.surface,
    quadrant3Fill: palette.raised,
    quadrant4Fill: palette.muted,
    quadrant1TextFill: palette.text,
    quadrant2TextFill: palette.text,
    quadrant3TextFill: palette.text,
    quadrant4TextFill: palette.text,
    quadrantPointFill: palette.accent,
    quadrantPointTextFill: palette.text,
    quadrantXAxisTextFill: palette.secondaryText,
    quadrantYAxisTextFill: palette.secondaryText,
    quadrantInternalBorderStrokeFill: palette.border,
    quadrantExternalBorderStrokeFill: palette.strongBorder,
    quadrantTitleFill: palette.text,
    git0: palette.accent,
    git1: palette.success,
    git2: palette.warning,
    git3: palette.danger,
    git4: palette.secondaryText,
    gitInv0: palette.surface,
    gitInv1: palette.surface,
    gitInv2: palette.surface,
    gitInv3: palette.surface,
    branchLabelColor: palette.text,
    commitLabelColor: palette.text,
    commitLabelBackground: palette.surface,
    tagLabelColor: palette.text,
    tagLabelBackground: palette.muted,
    tagLabelBorder: palette.border,
    cScale0: palette.accent,
    cScale1: palette.success,
    cScale2: palette.warning,
    cScale3: palette.danger,
    cScale4: palette.secondaryText,
    cScale5: palette.strongBorder,
    pie1: palette.accent,
    pie2: palette.success,
    pie3: palette.warning,
    pie4: palette.danger,
    pie5: palette.secondaryText,
    pie6: palette.strongBorder,
    pieStrokeColor: palette.background,
    pieOuterStrokeColor: palette.border,
    pieSectionTextColor: palette.text,
    pieLegendTextColor: palette.text,
    requirementBackground: palette.raised,
    requirementBorderColor: palette.strongBorder,
    requirementBorderSize: '1',
    requirementTextColor: palette.text,
    xyChart: {
      backgroundColor: palette.background,
      titleColor: palette.text,
      dataLabelColor: palette.text,
      legendTextColor: palette.text,
      xAxisTitleColor: palette.text,
      xAxisLabelColor: palette.secondaryText,
      xAxisTickColor: palette.border,
      xAxisLineColor: palette.strongBorder,
      yAxisTitleColor: palette.text,
      yAxisLabelColor: palette.secondaryText,
      yAxisTickColor: palette.border,
      yAxisLineColor: palette.strongBorder,
      plotColorPalette: [palette.accent, palette.success, palette.warning, palette.danger, palette.secondaryText].join(','),
    },
    radar: {
      axisColor: palette.strongBorder,
      axisStrokeWidth: 1,
      axisLabelFontSize: 12,
      curveOpacity: 0.34,
      curveStrokeWidth: 2,
      graticuleColor: palette.border,
      graticuleStrokeWidth: 1,
      graticuleOpacity: 0.6,
      legendBoxSize: 11,
      legendFontSize: 12,
    },
  }

  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    look: type === 'flowchart' || type === 'state' || type === 'class' ? 'neo' : 'classic',
    themeVariables,
    markdownAutoWrap: true,
    flowchart: {
      diagramPadding: 16,
      htmlLabels: true,
      nodeSpacing,
      rankSpacing: flowchartRankSpacing,
      curve: 'linear',
      padding: density === 'dense' ? 9 : 12,
      wrappingWidth: density === 'dense' ? 170 : 190,
    },
    sequence: {
      diagramMarginX: 28,
      diagramMarginY: 18,
      actorMargin,
      width: 150,
      height: 50,
      boxMargin: 10,
      boxTextMargin: 6,
      noteMargin: 14,
      messageMargin,
      mirrorActors: false,
      bottomMarginAdj: 8,
      actorFontSize: 13,
      messageFontSize: 12,
      noteFontSize: 12,
      wrap: true,
      wrapPadding: 10,
    },
    er: {
      diagramPadding: 18,
      layoutDirection: 'LR',
      minEntityWidth: 120,
      minEntityHeight: 70,
      entityPadding,
      nodeSpacing: nodeSpacing + 2,
      rankSpacing: rankSpacing + 4,
      fontSize: 12,
      stroke: palette.strongBorder,
      fill: palette.raised,
    },
    state: {
      padding: 12,
      noteMargin: 12,
      nodeSpacing: nodeSpacing + 4,
      rankSpacing,
      miniPadding: 5,
      fontSize: 12,
      radius: 8,
      defaultRenderer: 'dagre-wrapper',
    },
    mindmap: {
      padding: 14,
      maxNodeWidth: density === 'dense' ? 160 : density === 'compact' ? 175 : 190,
    },
    class: {
      padding: 10,
      nodeSpacing: nodeSpacing + 4,
      rankSpacing,
      diagramPadding: 16,
      htmlLabels: true,
      hideEmptyMembersBox: true,
      hierarchicalNamespaces: true,
      defaultRenderer: 'dagre-wrapper',
    },
    gantt: {
      barHeight: 20,
      barGap: 6,
      topPadding: 46,
      rightPadding: 30,
      leftPadding: 84,
      fontSize: 12,
      sectionFontSize: 12,
      displayMode: 'compact',
    },
    timeline: {
      diagramMarginX: 28,
      diagramMarginY: 18,
      padding: 10,
      boxMargin: 10,
      taskMargin: 10,
      taskFontSize: 12,
      disableMulticolor: true,
    },
    journey: {
      diagramMarginX: 28,
      diagramMarginY: 18,
      leftMargin: 120,
      maxLabelWidth: 220,
      boxMargin: 10,
      taskMargin: 18,
      taskFontSize: 12,
      actorColours: [palette.accent, palette.success, palette.warning, palette.secondaryText],
      sectionFills: [palette.surface, palette.raised, palette.muted],
      sectionColours: [palette.text, palette.text, palette.text],
      titleColor: palette.text,
    },
    gitGraph: {
      diagramPadding: 14,
      showCommitLabel: true,
      showBranches: true,
    },
    quadrantChart: {
      chartWidth: 620,
      chartHeight: 620,
      titleFontSize: 18,
      titlePadding: 12,
      quadrantPadding: 10,
      xAxisLabelPadding: 8,
      yAxisLabelPadding: 8,
      xAxisLabelFontSize: 12,
      yAxisLabelFontSize: 12,
      quadrantLabelFontSize: 13,
      pointLabelFontSize: 11,
      pointRadius: 5,
      quadrantInternalBorderStrokeWidth: 1,
      quadrantExternalBorderStrokeWidth: 1,
    },
    pie: {
      textPosition: 0.72,
      donutHole: 0,
      legendPosition: 'right',
    },
    xyChart: {
      width: 720,
      height: 460,
      titleFontSize: 18,
      titlePadding: 12,
      showDataLabel: density === 'comfortable',
      showDataLabelOutsideBar: false,
      showTitle: true,
      showLegend: true,
      legendFontSize: 12,
      legendPadding: 8,
    },
    requirement: {
      rect_fill: palette.raised,
      text_color: palette.text,
      rect_border_size: '1',
      rect_border_color: palette.strongBorder,
      rect_min_width: density === 'dense' ? 180 : 220,
      rect_min_height: 70,
      fontSize: 12,
      rect_padding: density === 'dense' ? 8 : 10,
      line_height: 20,
    },
    kanban: {
      padding: density === 'dense' ? 8 : 12,
      sectionWidth: density === 'dense' ? 190 : density === 'compact' ? 220 : 250,
    },
    sankey: {
      width: 760,
      height: density === 'dense' ? 460 : 520,
      linkColor: 'gradient',
      nodeAlignment: 'justify',
      useMaxWidth: true,
      showValues: true,
      nodeWidth: 12,
      nodePadding: density === 'dense' ? 8 : 14,
      labelStyle: 'outlined',
    },
    radar: {
      width: 620,
      height: 520,
      marginTop: 44,
      marginRight: 72,
      marginBottom: 54,
      marginLeft: 72,
      axisScaleFactor: density === 'dense' ? 0.9 : 1,
      axisLabelFactor: 1.08,
      curveTension: 0.16,
    },
    ishikawa: {
      diagramPadding: density === 'dense' ? 14 : 22,
      useMaxWidth: true,
    },
  }
}

export function mermaidVisualProfile(type: MermaidDiagramType | 'unknown'): string {
  return ({
    flowchart: 'process', sequence: 'interaction', er: 'schema', state: 'lifecycle', mindmap: 'hierarchy', class: 'structure',
    gantt: 'planning', timeline: 'chronology', gitgraph: 'versioning', journey: 'experience', quadrant: 'positioning',
    kanban: 'work-management', requirement: 'traceability', sankey: 'flow-quantity', xychart: 'metrics', pie: 'composition', radar: 'multi-axis', treemap: 'hierarchical-composition', ishikawa: 'root-cause', unknown: 'generic',
  } as const)[type]
}
