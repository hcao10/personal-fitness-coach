import { Text, View } from "react-native"; import { Screen, styles } from "../src/Screen";
export default function Progress() { return <Screen eyebrow="PROGRESS / 周度复盘" title="看清变化，再决定下一步"><View style={styles.card}><Text style={styles.label}>计划调整</Text><Text style={styles.value}>系统先生成差异草案</Text><Text>只有你接受后，新计划版本才会生效。</Text></View></Screen>; }
