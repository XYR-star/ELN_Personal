const SUPPORTED_LANGS = ['zh_CN', 'en_GB', 'en_US'];

const DICTIONARIES = {
  zh_CN: {
    'app.title': '实验规划日历',
    'app.eyebrow': '实验规划',
    'nav.dashboard': '仪表盘',
    'nav.experiments': '实验',
    'nav.database': '资源',
    'nav.planner': '规划日历',
    'nav.scheduler': '调度表',
    'nav.team': '团队',
    'action.today': '今天',
    'action.previous': '上一页',
    'action.next': '下一页',
    'action.newPlan': '新建计划',
    'action.save': '保存',
    'action.markDone': '标记完成',
    'action.quickDone': '完成',
    'action.backfill': '补记录',
    'action.delay': '推迟',
    'action.delete': '删除',
    'view.label': '视图模式',
    'view.month': '月',
    'view.week': '周',
    'view.day': '今日',
    'filter.type': '类型',
    'filter.status': '状态',
    'filter.all': '全部',
    'filter.searchPlaceholder': '搜索标题、备注、链接',
    'side.selectedDate': '选中日期',
    'side.planCount': ' · {count} 个计划',
    'dialog.new': '新建计划',
    'dialog.edit': '编辑计划',
    'dialog.close': '关闭',
    'field.title': '标题',
    'field.titlePlaceholder': '例如：Day 1 mRNA 转染',
    'field.type': '类型',
    'field.start': '开始时间',
    'field.end': '结束时间',
    'field.status': '状态',
    'field.experimentUrl': '关联实验 URL',
    'field.itemUrl': '关联资源 URL',
    'field.note': '备注',
    'field.notePlaceholder': '步骤、提醒、条件、注意事项',
    'empty.noPlansInDay': '这一天还没有计划。',
    'empty.noPlans': '暂无计划',
    'confirm.delete': '删除这个计划？',
    'calendar.monthTitle': '{year} 年 {month} 月',
    'type.pcr': 'PCR',
    'type.cloning': '同源/克隆',
    'type.cell_passage': '传细胞',
    'type.transfection': '转染',
    'type.mrna_transfection': '转染 mRNA',
    'type.observation': '观察',
    'type.sampling': '取样',
    'type.sequencing': '送测',
    'type.meeting': '讨论',
    'type.other': '其他',
    'status.planned': '计划中',
    'status.done': '已完成',
    'status.delayed': '推迟',
    'status.cancelled': '取消',
    'weekday.mon': '周一',
    'weekday.tue': '周二',
    'weekday.wed': '周三',
    'weekday.thu': '周四',
    'weekday.fri': '周五',
    'weekday.sat': '周六',
    'weekday.sun': '周日'
  },
  en_GB: {
    'app.title': 'Experiment Planner',
    'app.eyebrow': 'Experiment planning',
    'nav.dashboard': 'Dashboard',
    'nav.experiments': 'Experiments',
    'nav.database': 'Resources',
    'nav.planner': 'Planner',
    'nav.scheduler': 'Scheduler',
    'nav.team': 'Team',
    'action.today': 'Today',
    'action.previous': 'Previous',
    'action.next': 'Next',
    'action.newPlan': 'New plan',
    'action.save': 'Save',
    'action.markDone': 'Mark done',
    'action.quickDone': 'Done',
    'action.backfill': 'Backfill',
    'action.delay': 'Delay',
    'action.delete': 'Delete',
    'view.label': 'View mode',
    'view.month': 'Month',
    'view.week': 'Week',
    'view.day': 'Day',
    'filter.type': 'Type',
    'filter.status': 'Status',
    'filter.all': 'All',
    'filter.searchPlaceholder': 'Search title, notes, links',
    'side.selectedDate': 'Selected date',
    'side.planCount': ' · {count} plans',
    'dialog.new': 'New plan',
    'dialog.edit': 'Edit plan',
    'dialog.close': 'Close',
    'field.title': 'Title',
    'field.titlePlaceholder': 'Example: Day 1 mRNA transfection',
    'field.type': 'Type',
    'field.start': 'Start time',
    'field.end': 'End time',
    'field.status': 'Status',
    'field.experimentUrl': 'Experiment URL',
    'field.itemUrl': 'Resource URL',
    'field.note': 'Notes',
    'field.notePlaceholder': 'Steps, reminders, conditions, cautions',
    'empty.noPlansInDay': 'No plans for this day.',
    'empty.noPlans': 'No plans',
    'confirm.delete': 'Delete this plan?',
    'calendar.monthTitle': '{month} {year}',
    'type.pcr': 'PCR',
    'type.cloning': 'Cloning',
    'type.cell_passage': 'Cell passage',
    'type.transfection': 'Transfection',
    'type.mrna_transfection': 'mRNA transfection',
    'type.observation': 'Observation',
    'type.sampling': 'Sampling',
    'type.sequencing': 'Sequencing',
    'type.meeting': 'Meeting',
    'type.other': 'Other',
    'status.planned': 'Planned',
    'status.done': 'Done',
    'status.delayed': 'Delayed',
    'status.cancelled': 'Cancelled',
    'weekday.mon': 'Mon',
    'weekday.tue': 'Tue',
    'weekday.wed': 'Wed',
    'weekday.thu': 'Thu',
    'weekday.fri': 'Fri',
    'weekday.sat': 'Sat',
    'weekday.sun': 'Sun'
  }
};

DICTIONARIES.en_US = DICTIONARIES.en_GB;

export function normalizeLang(value) {
  const candidate = String(value || '').replace('-', '_');
  if (SUPPORTED_LANGS.includes(candidate)) return candidate;
  const short = candidate.slice(0, 2).toLowerCase();
  if (short === 'en') return 'en_GB';
  if (short === 'zh') return 'zh_CN';
  return 'zh_CN';
}

export function createI18n(lang) {
  const activeLang = normalizeLang(lang);
  const dictionary = DICTIONARIES[activeLang] || DICTIONARIES.zh_CN;
  const fallback = DICTIONARIES.zh_CN;

  function t(key, params = {}) {
    const template = dictionary[key] || fallback[key] || key;
    return Object.entries(params).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, value),
      template
    );
  }

  return { lang: activeLang, t };
}

export function langFromUrl(search = globalThis.location?.search || '') {
  return normalizeLang(new URLSearchParams(search).get('lang'));
}
