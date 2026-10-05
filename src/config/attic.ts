/**
 * 阁楼的交互点。坐标用底图的归一化坐标(0~1,左上为原点),
 * 这样换底图(临时图 → 正式原画)只要改这里的数,不用改代码。
 *
 * 正式原画 public/attic_bg.png 到位后:打开 AtticScene 顶部的 DEBUG,
 * 点画面会在控制台打印归一化坐标,照着改下面的 x / y 即可。
 */
export interface AtticSpot {
  id: string;
  x: number;           // 0~1
  y: number;           // 0~1
  r: number;           // 点击半径,占底图宽度的比例
  label: string;
}

export const SCANNER: AtticSpot = { id: 'scanner', x: 0.910, y: 0.338, r: 0.04, label: 'Scan the attic' };

export const SPOTS: AtticSpot[] = [
  { id: 'site',      x: 0.693, y: 0.606, r: 0.055, label: 'This website' },        // 图纸卷
  { id: 'superauto', x: 0.459, y: 0.595, r: 0.035, label: 'SuperAuto USA' },       // 小车模型
  { id: 'jobtrack',  x: 0.550, y: 0.673, r: 0.045, label: 'JobTrack' },            // 皮面账本
  { id: 'process',   x: 0.130, y: 0.372, r: 0.105, label: 'How this site was made' }, // 软木板
  { id: 'stairs',    x: 0.073, y: 0.720, r: 0.065, label: 'Go back downstairs' },  // 楼梯栏杆
];
