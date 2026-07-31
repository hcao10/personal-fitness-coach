import { Text, View } from "react-native"; import { Screen, styles } from "../src/Screen";
export default function Nutrition() { return <Screen eyebrow="NUTRITION / 饮食" title="看得见，也要确认得清"><View style={styles.card}><Text style={styles.label}>图片识别原则</Text><Text style={styles.value}>候选食物 → 确认份量 → 数据库计算</Text><Text>我们不会把单张照片包装成“精确热量”。</Text></View></Screen>; }
