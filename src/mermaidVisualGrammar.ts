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
  if (type === 'flowchart' || type === 'state' || type === 'class') {
    if (lines.length > 46) return 'dense'
    if (lines.length > 24) return 'compact'
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
      rankSpacing,
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
  }
}

export function mermaidVisualProfile(type: MermaidDiagramType | 'unknown'): string {
  return ({
    flowchart: 'process', sequence: 'interaction', er: 'schema', state: 'lifecycle', mindmap: 'hierarchy', class: 'structure',
    gantt: 'planning', timeline: 'chronology', gitgraph: 'versioning', journey: 'experience', quadrant: 'positioning', unknown: 'generic',
  } as const)[type]
}
