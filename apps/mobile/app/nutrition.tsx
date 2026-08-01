import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Screen, styles } from "../src/Screen";
import { api } from "../src/api";

type Food={ref:string;name:string;source:string;attribution?:string;per100g:{calories:number;proteinG:number;carbsG:number;fatG:number}};
type Daily={calories:number;proteinG:number;carbsG:number;fatG:number};
const today=()=>new Date().toISOString().slice(0,10);

export default function Nutrition(){const[query,setQuery]=useState("");const[foods,setFoods]=useState<Food[]>([]);const[daily,setDaily]=useState<Daily|null>(null);const[selected,setSelected]=useState<Food|null>(null);const[grams,setGrams]=useState("100");const[message,setMessage]=useState("");
  const load=async()=>{try{setDaily(await api<Daily>(`/api/v1/nutrition/daily?date=${today()}`))}catch{}};
  // The request resolves asynchronously; the function is also reused after a successful meal save.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void load()},[]);
  const search=async()=>{if(query.trim().length<2)return;try{const body=await api<{foods:Food[]}>(`/api/v1/foods/search?q=${encodeURIComponent(query)}&locale=zh&limit=20`);setFoods(body.foods)}catch(e){setMessage(e instanceof Error?e.message:"搜索失败")}};
  const save=async()=>{if(!selected||Number(grams)<=0)return;try{await api("/api/v1/meals",{method:"POST",body:JSON.stringify({mealType:"other",eatenAt:new Date().toISOString(),items:[{name:selected.name,grams:Number(grams),nutritionRef:selected.ref,userCorrected:true}]})});setSelected(null);setMessage("已加入今天的营养记录。");await load()}catch(e){setMessage(e instanceof Error?e.message:"记录失败")}};
  return <Screen eyebrow="NUTRITION / 饮食" title="先找到，再由你确认"><View style={styles.card}><Text style={styles.label}>今日营养</Text><Text style={styles.value}>{Math.round(daily?.calories||0)} kcal</Text><Text>蛋白质 {Math.round(daily?.proteinG||0)}g · 碳水 {Math.round(daily?.carbsG||0)}g · 脂肪 {Math.round(daily?.fatG||0)}g</Text></View><View style={{flexDirection:"row",gap:8}}><TextInput value={query} onChangeText={setQuery} onSubmitEditing={()=>void search()} placeholder="鸡胸肉、燕麦、品牌" style={[styles.card,{flex:1,padding:14}]}/><Pressable style={[styles.button,{justifyContent:"center"}]} onPress={()=>void search()}><Text style={styles.buttonText}>搜索</Text></Pressable></View>{foods.map(food=><Pressable key={food.ref} style={styles.card} onPress={()=>setSelected(food)}><Text style={styles.label}>{food.source==="usda"?"官方成分数据":food.source==="open_food_facts"?"社区包装数据":"我的食品"}</Text><Text style={styles.value}>{food.name}</Text><Text>{Math.round(food.per100g.calories)} kcal / 100g · 蛋白质 {food.per100g.proteinG.toFixed(1)}g</Text></Pressable>)}{selected&&<View style={styles.card}><Text style={styles.value}>{selected.name}</Text><TextInput keyboardType="decimal-pad" value={grams} onChangeText={setGrams} placeholder="食用克数" style={{borderWidth:1,borderColor:"#d4d1c8",borderRadius:8,padding:10,marginVertical:12}}/><Pressable style={styles.button} onPress={()=>void save()}><Text style={styles.buttonText}>确认份量并记录</Text></Pressable></View>}{message?<Text style={styles.label}>{message}</Text>:null}<View style={styles.card}><Text>拍照仍采用“候选食物 → 确认份量 → 数据库计算”，不会把单张照片包装成精确热量。</Text></View></Screen>}
