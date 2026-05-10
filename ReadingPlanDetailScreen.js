import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Platform, StatusBar, Modal, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from './firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useSharedValue, withTiming, useAnimatedProps } from 'react-native-reanimated';

const THEME = {
  bg: '#0f0a19',
  bg2: '#1a1325',
  cardSolid: '#1d1530',
  modalSolid: '#1f1636',
  text: '#fdf4ff',
  textDim: '#c4b5fd',
  stroke: 'rgba(255,255,255,0.10)',
  accent2: '#22d3ee',
  accent3: '#34d399',
  warn: '#f59e0b',
};
const GRAD_CARD   = ['#2d1b4c', '#3b256c', '#4338ca'];
const GRAD_PILL   = ['#22d3ee', '#34d399'];
const GRAD_DANGER = ['#ff7a59', '#ef4444'];

function parseDateInput(txt){ if(!txt) return null; const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(txt.trim()); if(!m) return null; const d=new Date(+m[1],+m[2]-1,+m[3]); return Number.isNaN(d.getTime())?null:d; }
function formatDateInput(v){ if(!v) return ''; if(typeof v==='string') return v; const d=v?.toDate? v.toDate(): new Date(v); return Number.isNaN(d.getTime())?'':d.toISOString().split('T')[0]; }
function getWeekNumber(d){ const onejan=new Date(d.getFullYear(),0,1); return Math.ceil((((d-onejan)/86400000)+onejan.getDay()+1)/7); }

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
function ProgressRing({ size=64, stroke=6, progress=0, fg=THEME.accent2, bg='rgba(255,255,255,0.10)' }){
  const r=(size-stroke)/2, c=2*Math.PI*r, val=useSharedValue(0);
  useEffect(()=>{ val.value=withTiming(progress,{duration:300});},[progress]);
  const animatedProps=useAnimatedProps(()=>({ strokeDashoffset: c - (c*Math.max(0,Math.min(100,val.value)))/100 }));
  return (
    <View style={{width:size,height:size,alignItems:'center',justifyContent:'center'}}>
      <Svg width={size} height={size}>
        <Circle cx={size/2} cy={size/2} r={r} stroke={bg} strokeWidth={stroke} fill="none"/>
        <AnimatedCircle cx={size/2} cy={size/2} r={r} stroke={fg} strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${c}, ${c}`} animatedProps={animatedProps}/>
      </Svg>
      <Text style={{position:'absolute',color:THEME.text,fontWeight:'800',fontSize:12}}>{Math.round(progress)}%</Text>
    </View>
  );
}

/* ============ small UI ============ */
function IconPill({ icon, onPress, accessibilityLabel }){
  return(
    <LinearGradient colors={GRAD_PILL} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.iconPillWrap}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.9} accessibilityLabel={accessibilityLabel} style={styles.iconPillTap}>
        <Ionicons name={icon} size={16} color="#0b1220"/>
      </TouchableOpacity>
    </LinearGradient>
  );
}
function CardShell({ children, style }){
  return(
    <LinearGradient colors={GRAD_CARD} start={{x:0,y:0}} end={{x:1,y:1}} style={[styles.cardBorder, style]}>
      <View style={styles.cardSolid}>{children}</View>
    </LinearGradient>
  );
}
function InfoStat({ icon,label,value,editable,onEdit }){
  return(
    <View style={styles.statBox}>
      <View style={styles.statIconWrap}><Ionicons name={icon} size={16} color={THEME.accent2}/></View>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
        <Text style={styles.statLabel}>{label}</Text>
        {editable && <TouchableOpacity onPress={onEdit} activeOpacity={0.8}><Ionicons name="create-outline" size={16} color={THEME.textDim}/></TouchableOpacity>}
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}
function HeaderBar({ navigation }){
  return(
    <SafeAreaView style={{backgroundColor:THEME.bg}}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerLeft} onPress={()=>navigation.goBack()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={THEME.accent2}/>
          <Text style={styles.backText}>กลับไปหน้าแผนการอ่าน</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function ToastPopup({ visible, icon="checkmark-circle", color=THEME.accent2, title, message, onClose, primaryText="ตกลง" }){
  if(!visible) return null;
  return(
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.toastOverlay}>
        <LinearGradient colors={['#2d1b4c','#221a45']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.toastBorder}>
          <View style={styles.toastCard}>
            <View style={[styles.toastIcon,{backgroundColor:'rgba(255,255,255,0.06)'}]}>
              <Ionicons name={icon} size={24} color={color}/>
            </View>
            {!!title && <Text style={styles.toastTitle}>{title}</Text>}
            {!!message && <Text style={styles.toastMsg}>{message}</Text>}
            <LinearGradient colors={GRAD_PILL} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.toastBtn}>
              <TouchableOpacity onPress={onClose} activeOpacity={0.9} style={{height:44,alignItems:'center',justifyContent:'center'}}>
                <Text style={{color:'#0b1220',fontWeight:'900'}}>{primaryText}</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

/* ============ Confirm ลบรูปปก ============ */
function FancyPopup({ visible, title, message, onCancel, onConfirm, confirmText='ลบ', cancelText='ยกเลิก' }){
  return(
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.popupOverlay}>
        <View style={[styles.popupGlow,{shadowColor:'#ef444455'}]}/>
        <LinearGradient colors={['#2e215a','#221a45']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.popupBorder}>
          <View style={styles.popupCard}>
            <View style={[styles.popupBadge,{backgroundColor:'#1f0b0b',shadowColor:'#ef444455'}]}>
              <Ionicons name="warning" size={24} color="#ff7a59"/>
            </View>
            <Text style={styles.popupTitle}>{title}</Text>
            <Text style={styles.popupMessage}>{message}</Text>
            <View style={styles.popupBtnRow}>
              <TouchableOpacity onPress={onCancel} activeOpacity={0.9} style={styles.popupBtnGhost}>
                <Text style={styles.popupBtnGhostText}>{cancelText}</Text>
              </TouchableOpacity>
              <LinearGradient colors={GRAD_DANGER} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.popupBtnGrad}>
                <TouchableOpacity onPress={onConfirm} activeOpacity={0.9}>
                  <Text style={styles.popupBtnText}>{confirmText}</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

/* ============ BlockStart Popup (จัดระเบียบ) ============ */
function BlockStartPopup({ visible, onClose, onOpenGoal, onOpenSchedule, needGoal, needSchedule }){
  if(!visible) return null;
  return(
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.toastOverlay}>
        <LinearGradient colors={['#2d1b4c','#221a45']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.toastBorder}>
          <View style={[styles.toastCard,{paddingTop:18}]}>
            {/* Header */}
            <View style={{alignItems:'center', marginBottom:10}}>
              <View style={[styles.toastIcon,{backgroundColor:'rgba(255,255,255,0.06)'}]}>
                <Ionicons name="alert-circle" size={24} color={THEME.warn}/>
              </View>
              <Text style={[styles.toastTitle,{marginTop:2}]}>ต้องตั้งค่าก่อนเริ่มอ่าน</Text>
              <Text style={styles.toastMsg}>โปรดตั้ง “ตารางวันอ่าน” และ “เป้าหมายรายวัน” ให้เรียบร้อยก่อน</Text>
            </View>

            {/* Checklist */}
            <View style={styles.checkWrap}>
              <View style={styles.checkRow}>
                <View style={[styles.checkIcon, {borderColor: needSchedule ? 'rgba(255,255,255,0.25)' : THEME.accent3, backgroundColor: needSchedule?'transparent':'rgba(52,211,153,0.18)'}]}>
                  <Ionicons name={needSchedule ? 'ellipse-outline' : 'checkmark'} size={14} color={needSchedule ? THEME.textDim : THEME.accent3}/>
                </View>
                <Text style={[styles.checkText, !needSchedule && {color:THEME.accent3}]}>ตั้งตารางวันอ่าน</Text>
              </View>
              <View style={styles.checkRow}>
                <View style={[styles.checkIcon, {borderColor: needGoal ? 'rgba(255,255,255,0.25)' : THEME.accent3, backgroundColor: needGoal?'transparent':'rgba(52,211,153,0.18)'}]}>
                  <Ionicons name={needGoal ? 'ellipse-outline' : 'checkmark'} size={14} color={needGoal ? THEME.textDim : THEME.accent3}/>
                </View>
                <Text style={[styles.checkText, !needGoal && {color:THEME.accent3}]}>กำหนดเป้าหมายรายวัน</Text>
              </View>
            </View>

            {/* Actions */}
            <View style={{flexDirection:'row', gap:10, marginTop:8}}>
              <TouchableOpacity onPress={onOpenSchedule} style={[styles.toastGhostBtn,{flex:1}]} activeOpacity={0.9}>
                <Ionicons name="calendar-outline" size={16} color={THEME.text}/>
                <Text style={{color:THEME.text,fontWeight:'800',marginLeft:6}}>ตั้งตาราง</Text>
              </TouchableOpacity>
              <LinearGradient colors={GRAD_PILL} start={{x:0,y:0}} end={{x:1,y:0}} style={[styles.toastBtn,{flex:1}]}>
                <TouchableOpacity onPress={onOpenGoal} activeOpacity={0.9} style={{height:44,alignItems:'center',justifyContent:'center'}}>
                  <Text style={{color:'#0b1220',fontWeight:'900'}}>ตั้งเป้าหมาย</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>

            {/* Close link */}
            <TouchableOpacity onPress={onClose} style={{alignSelf:'center', marginTop:10}} activeOpacity={0.8}>
              <Text style={{color:THEME.textDim}}>ปิด</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

/* ============ Screen ============ */
export default function ReadingPlanDetailScreen({ route, navigation }){
  const { bookId } = route.params || {};
  const uid = auth.currentUser?.uid;

  const [book, setBook]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageInput, setPageInput] = useState('');
  const scrollRef = useRef(null);

  // goal modal
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [goalDateText, setGoalDateText] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // edit modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editTitle, setEditTitle]   = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editPages, setEditPages]   = useState('');

  // delete cover confirm
  const [coverPopup, setCoverPopup] = useState({ show:false });

  // toast
  const [toast, setToast] = useState({ visible:false, icon:'checkmark-circle', color:THEME.accent2, title:'', message:'' });

  // block start
  const [blockStart, setBlockStart] = useState(false);

  /* ===== cover ===== */
  const ensureCoversFolder = async ()=>{
    const dir = FileSystem.documentDirectory + 'covers';
    const info = await FileSystem.getInfoAsync(dir);
    if(!info.exists) await FileSystem.makeDirectoryAsync(dir,{intermediates:true});
    return dir;
  };
  const askMediaPermission = async ()=>{
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status==='granted';
  };
  const handlePickCover = async ()=>{
    try{
      const ok = await askMediaPermission();
      if(!ok){ setToast({visible:true,icon:'alert-circle',color:THEME.warn,title:'ต้องการสิทธิ์รูปภาพ',message:'โปรดอนุญาตเข้าถึงคลังรูปภาพ'}); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing:true, aspect:[3,4], quality:0.9 });
      if(result.canceled) return;
      const uri = result.assets?.[0]?.uri; if(!uri) return;
      const folder = await ensureCoversFolder(); const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const dest = `${folder}/${bookId}_${Date.now()}.${ext}`; await FileSystem.copyAsync({from:uri,to:dest});
      await updateDoc(doc(db,'users',uid,'books',bookId), { coverUri:dest, coverUpdatedAt:serverTimestamp(), updatedAt:serverTimestamp() });
      setToast({visible:true,icon:'image',color:THEME.accent2,title:'อัปเดตรูปปกแล้ว',message:'เปลี่ยนรูปปกสำเร็จ'});
    }catch(e){ setToast({visible:true,icon:'alert-circle',color:THEME.warn,title:'เลือกรูปปกไม่สำเร็จ',message:e?.message||'โปรดลองอีกครั้ง'}); }
  };
  const handleRemoveCover = ()=> setCoverPopup({show:true});
  const confirmRemoveCover = async ()=>{
    setCoverPopup({show:false});
    try{
      await updateDoc(doc(db,'users',uid,'books',bookId), { coverUri:null, coverUpdatedAt:serverTimestamp(), updatedAt:serverTimestamp() });
      setToast({visible:true,icon:'trash-outline',color:'#fca5a5',title:'เอารูปปกออกแล้ว',message:'ลบรูปปกสำเร็จ'});
    }catch{ setToast({visible:true,icon:'alert-circle',color:THEME.warn,title:'เอารูปปกออกไม่สำเร็จ'}); }
  };

  const openEditModal = ()=>{
    setEditTitle(book?.title||''); setEditAuthor(book?.author||''); setEditPages(String(book?.pages||'')); setEditModalVisible(true);
  };
  const handleSaveEdit = async ()=>{
    if(!uid || !bookId) return;
    if(!editTitle.trim() || !editAuthor.trim() || !Number(editPages)){ setToast({visible:true,icon:'alert-circle',color:THEME.warn,title:'ข้อมูลไม่ครบ',message:'กรุณากรอกข้อมูลให้ครบถ้วน'}); return;}
    try{
      await updateDoc(doc(db,'users',uid,'books',bookId), { title:editTitle.trim(), author:editAuthor.trim(), pages:Number(editPages), updatedAt:serverTimestamp() });
      setEditModalVisible(false);
      setToast({visible:true,icon:'checkmark-circle',color:THEME.accent2,title:'บันทึกแล้ว',message:'แก้ไขข้อมูลหนังสือเรียบร้อย'});
    }catch{ setToast({visible:true,icon:'alert-circle',color:THEME.warn,title:'บันทึกไม่สำเร็จ'}); }
  };

  useEffect(()=>{
    if(!uid || !bookId) return;
    const ref = doc(db,'users',uid,'books',bookId);
    const unsub = onSnapshot(ref,(snap)=>{
      const data = snap.exists()? {id:snap.id, ...snap.data()} : null;
      setBook(data);
      if(!data){ navigation.reset({ index:0, routes:[{ name:'Main', params:{screen:'แผนการอ่าน'} }]}); }
      const g = data?.goal||{}; if(g?.targetDate) setGoalDateText(formatDateInput(g.targetDate));
      setLoading(false);
    },()=> setLoading(false));
    return ()=>unsub();
  },[uid,bookId,navigation]);

  const pages       = Number(book?.pages||0);
  const currentPage = Number(book?.currentPage||0);
  const remainingPages = Math.max(0, pages - currentPage);

  const progress = useMemo(()=> !pages?0:Math.round(Math.max(0,Math.min(100,(currentPage/pages)*100))), [currentPage,pages]);

  const createdAtText = useMemo(()=>{
    const ts=book?.createdAt; if(!ts) return '-';
    const d=ts?.toDate? ts.toDate(): new Date(ts);
    return Number.isNaN(d.getTime())?'-': d.toISOString().split('T')[0];
  },[book]);

  const readingTimeSummary = useMemo(()=>{
    const sch = book?.readingSchedule;
    if(sch && typeof sch==='object'){
      const pairs=[]; Object.keys(sch).forEach((d)=>Object.keys(sch[d]||{}).forEach((t)=>pairs.push(`${d} ${t}`)));
      if(pairs.length) return pairs.slice(0,3).join(', ')+(pairs.length>3?'…':'');
    }
    if(book?.readingTime) return `${book.readingTime}${book?.sessionMinutes?` (${book.sessionMinutes}น.)`:''}`;
    return 'ไม่ได้กำหนด';
  },[book]);

  const aiDailySuggestion = useMemo(()=>{
    if(!book?.readingSchedule) return 0;
    const today=new Date(); today.setHours(0,0,0,0);
    const target=parseDateInput(goalDateText); if(!target) return 0;
    const sch=book.readingSchedule;
    const diffDays=Math.ceil((target.getTime()-today.getTime())/86400000);
    const readingDays=[];
    for(let i=0;i<=diffDays;i++){
      const d=new Date(today.getTime()+i*86400000);
      const day=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'][d.getDay()];
      if(sch[day] && Object.keys(sch[day]).length>0) readingDays.push(d);
    }
    if(!remainingPages || !readingDays.length) return 0;
    return Math.max(1, Math.ceil(remainingPages/readingDays.length));
  },[book?.readingSchedule,remainingPages,goalDateText]);

  const aiSuggestion = useMemo(()=>{
    if(!book?.readingSchedule) return {daily:0,weekly:0,monthly:0};
    const today=new Date(); today.setHours(0,0,0,0);
    const target=parseDateInput(goalDateText); if(!target) return {daily:0,weekly:0,monthly:0};
    const sch=book.readingSchedule, readingDays=[], diffDays=Math.ceil((target.getTime()-today.getTime())/86400000);
    for(let i=0;i<=diffDays;i++){ const d=new Date(today.getTime()+i*86400000); const day=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'][d.getDay()]; if(sch[day] && Object.keys(sch[day]).length>0) readingDays.push(d); }
    if(!remainingPages || !readingDays.length) return {daily:0,weekly:0,monthly:0};
    const daily=Math.max(1,Math.ceil(remainingPages/readingDays.length));
    const weeksMap={}; readingDays.forEach(d=>{weeksMap[getWeekNumber(d)]=true;});
    const monthsMap={}; readingDays.forEach(d=>{monthsMap[`${d.getFullYear()}-${d.getMonth()}`]=true;});
    return {daily, weekly: Math.ceil(remainingPages/Math.max(1,Object.keys(weeksMap).length)), monthly: Math.ceil(remainingPages/Math.max(1,Object.keys(monthsMap).length))};
  },[book?.readingSchedule,remainingPages,goalDateText]);

  const handleSaveProgress = async ()=>{
    if(!uid || !bookId) return;
    const val=Number(pageInput);
    if(Number.isNaN(val) || val<0 || (pages && val>pages)){ setToast({visible:true,icon:'alert-circle',color:THEME.warn,title:`กรุณากรอกเลขหน้า 0 - ${pages||0}`}); return; }
    try{
      await updateDoc(doc(db,'users',uid,'books',bookId), { currentPage:val, updatedAt:serverTimestamp() });
      setPageInput('');
      setToast({visible:true,icon:'save-outline',color:THEME.accent2,title:'บันทึกความคืบหน้าแล้ว'});
    }catch{ setToast({visible:true,icon:'alert-circle',color:THEME.warn,title:'บันทึกไม่สำเร็จ'}); }
  };

  const handleSaveGoal = async ()=>{
    if(!uid || !bookId) return;
    if(!parseDateInput(goalDateText)){ setToast({visible:true,icon:'alert-circle',color:THEME.warn,title:'รูปแบบวันที่ไม่ถูกต้อง',message:'กรุณาเลือกวันที่ให้ถูกต้อง'}); return; }
    try{
      await updateDoc(doc(db,'users',uid,'books',bookId), {
        dailyGoal: aiDailySuggestion || Number(book?.dailyGoal) || 1,
        goal: { type:'date', targetDate: goalDateText },
        updatedAt: serverTimestamp(),
      });
      setGoalModalVisible(false);
      setToast({visible:true,icon:'checkmark-circle',color:THEME.accent2,title:'บันทึกเป้าหมายแล้ว'});
    }catch{ setToast({visible:true,icon:'alert-circle',color:THEME.warn,title:'เกิดข้อผิดพลาดในการบันทึกเป้าหมาย'}); }
  };

  // เงื่อนไขก่อนเริ่มอ่าน
  const hasSchedule  = useMemo(()=>{ const s=book?.readingSchedule; if(!s||typeof s!=='object') return false; return Object.values(s).some(obj=>obj&&Object.keys(obj).length>0);},[book?.readingSchedule]);
  const hasDailyGoal = Number(book?.dailyGoal)>0;

  const onPressStart = ()=>{
    if(!hasSchedule || !hasDailyGoal){ setBlockStart(true); return; }
    navigation.navigate('ReadingTimer',{ bookId, title:book?.title||'', pages:Number(book?.pages||0), currentPage:Number(book?.currentPage||0) });
  };

  if(loading){
    return(<View style={[styles.center,{backgroundColor:THEME.bg}]}><ActivityIndicator color={THEME.accent2}/></View>);
  }
  if(!book){
    return(<View style={[styles.center,{backgroundColor:THEME.bg}]}><HeaderBar navigation={navigation}/><Text style={{color:THEME.textDim,marginTop:12}}>ไม่พบแผนการอ่านนี้</Text></View>);
  }

  return (
    <View style={styles.screen}>
      <HeaderBar navigation={navigation}/>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollBody}>
        {/* ===== การ์ดหลัก ===== */}
        <CardShell style={{marginBottom:12}}>
          <View style={styles.cardInnerPad}>
            <View style={styles.fabStack}>
              <TouchableOpacity onPress={openEditModal} style={[styles.fab,{backgroundColor:THEME.accent2}]} activeOpacity={0.9}>
                <Ionicons name="create-outline" size={18} color="#0b1220"/>
              </TouchableOpacity>
              {book?.coverUri && (
                <TouchableOpacity onPress={handleRemoveCover} style={[styles.fab,{backgroundColor:'#fca5a5'}]} activeOpacity={0.9}>
                  <Ionicons name="trash-outline" size={18} color="#0b1220"/>
                </TouchableOpacity>
              )}
            </View>

            {/* ปก */}
            <View style={styles.cover}>
              {book?.coverUri ? (
                <>
                  <Image source={{uri:book.coverUri}} style={styles.coverImg}/>
                  <TouchableOpacity style={styles.coverEditBtn} onPress={handlePickCover} activeOpacity={0.9}>
                    <Ionicons name="camera-outline" size={16} color="#0b1220"/>
                    <Text style={styles.coverEditText}>แก้รูปปก</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Ionicons name="book-outline" size={64} color={THEME.textDim}/>
                  <TouchableOpacity style={styles.coverAddBtn} onPress={handlePickCover} activeOpacity={0.9}>
                    <Ionicons name="add" size={16} color="#0b1220"/>
                    <Text style={styles.coverAddText}>เลือกรูปปก</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* ปุ่มเริ่มอ่าน */}
            <LinearGradient colors={GRAD_PILL} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.primaryBtn}>
              <TouchableOpacity style={styles.primaryTap} onPress={onPressStart} activeOpacity={0.9}>
                <Ionicons name="play" size={16} color="#0b1220"/>
                <Text style={styles.primaryBtnText}>เริ่มอ่านตอนนี้</Text>
              </TouchableOpacity>
            </LinearGradient>

            {/* Quick */}
            <View style={styles.quickRow}>
              <IconPill icon="save-outline" accessibilityLabel="บันทึกความคืบหน้า" onPress={()=>scrollRef.current?.scrollToEnd({animated:true})}/>
              <IconPill icon="flag-outline" accessibilityLabel="ตั้งเป้าหมายการอ่าน" onPress={()=>setGoalModalVisible(true)}/>
              <IconPill icon="calendar-outline" accessibilityLabel="ไปหน้าตารางอ่าน" onPress={()=>navigation.navigate('ReadingScheduleEditor',{bookId})}/>
            </View>

            {/* ข้อมูล */}
            <View style={{width:'100%',marginTop:10}}>
              <Text style={styles.title}>{book.title||'-'}</Text>
              <Text style={styles.author}>{book.author||'-'}</Text>
              <View style={{flexDirection:'row',alignItems:'center',marginTop:6}}>
                <Ionicons name="pricetag-outline" size={14} color={THEME.textDim}/>
                <Text style={styles.meta}>  {book.category||'การพัฒนาตนเอง'}</Text>
              </View>
            </View>

            {/* Progress */}
            <View style={{width:'100%',marginTop:10,flexDirection:'row',alignItems:'center',gap:12}}>
              <ProgressRing progress={progress}/>
              <View style={{flex:1}}>
                <Text style={styles.progressLabel}>ความคืบหน้า</Text>
                <View style={styles.progressBarBg}>
                  <LinearGradient colors={GRAD_PILL} start={{x:0,y:0}} end={{x:1,y:0}} style={[styles.progressBarFill,{width:`${progress}%`}]} />
                </View>
                <View style={styles.progressRow}>
                  <Text style={styles.progressSmall}>หน้า {currentPage}</Text>
                  <Text style={styles.progressSmall}>{progress}%</Text>
                  <Text style={styles.progressSmall}>หน้าที่ {pages}</Text>
                </View>
              </View>
            </View>

            {/* สถิติ */}
            <View style={styles.grid}>
              <InfoStat icon="document-text-outline" label="จำนวนหน้า" value={`${pages||0} หน้า`}/>
              <InfoStat icon="calendar-outline" label="เริ่มอ่าน" value={createdAtText}/>
              <InfoStat icon="time-outline" label="เวลาอ่าน" value={readingTimeSummary} editable onEdit={()=>navigation.navigate('ReadingScheduleEditor',{bookId})}/>
              <InfoStat icon="flag-outline" label="เป้าหมายรายวัน" value={book.dailyGoal?`${book.dailyGoal} หน้า/วัน`:'ไม่ได้กำหนด'} editable onEdit={()=>setGoalModalVisible(true)}/>
            </View>

            {/* เส้นทางสู่เป้าหมาย */}
            <View style={{width:'100%',marginTop:8}}>
              <CardShell>
                <View style={{padding:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
                  <View style={{flex:1,paddingRight:10}}>
                    <Text style={{color:THEME.text,fontWeight:'900'}}>เส้นทางสู่เป้าหมาย</Text>
                    <Text style={{color:THEME.textDim,marginTop:4}}>
                      ต้องอ่านวันละ <Text style={{color:THEME.accent2,fontWeight:'900'}}>{aiDailySuggestion||'-'}</Text> หน้า
                      เพื่อจบทัน <Text style={{color:THEME.accent2,fontWeight:'900'}}>{goalDateText||'-'}</Text>
                    </Text>
                  </View>
                  <TouchableOpacity onPress={()=>setGoalModalVisible(true)} activeOpacity={0.9} style={{backgroundColor:THEME.accent2,paddingHorizontal:12,paddingVertical:8,borderRadius:10}}>
                    <Text style={{color:'#0b1220',fontWeight:'900'}}>ปรับ</Text>
                  </TouchableOpacity>
                </View>
              </CardShell>
            </View>
          </View>
        </CardShell>

        {/* ===== บันทึกความคืบหน้า ===== */}
        <CardShell>
          <View style={styles.cardInnerPad}>
            <Text style={styles.sectionTitle}>บันทึกความคืบหน้า</Text>
            <Text style={styles.helper}>อ่านถึงหน้า (ล่าสุด: {currentPage||0})</Text>
            <TextInput style={styles.input} value={pageInput} onChangeText={setPageInput} keyboardType="numeric" placeholder="0" placeholderTextColor={THEME.textDim}/>
            <LinearGradient colors={GRAD_PILL} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.secondaryBtn}>
              <TouchableOpacity onPress={handleSaveProgress} activeOpacity={0.9} style={styles.secondaryTap}>
                <Ionicons name="save-outline" size={16} color="#0b1220"/>
                <Text style={styles.secondaryBtnText}>บันทึกความคืบหน้า</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </CardShell>
      </ScrollView>

      {/* ===== Goal Modal ===== */}
      <Modal visible={goalModalVisible} transparent animationType="slide" onRequestClose={()=>setGoalModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCardSolid}>
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
              <Text style={styles.modalTitle}>กำหนดเป้าหมายการอ่าน</Text>
              <TouchableOpacity onPress={()=>setGoalModalVisible(false)}><Ionicons name="close" size={20} color={THEME.text}/></TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>วันที่ต้องการอ่านให้จบ</Text>
            <TouchableOpacity style={styles.input} onPress={()=>setShowDatePicker(true)} activeOpacity={0.85}>
              <Text style={{color:THEME.text}}>{goalDateText||'เลือกวันที่'}</Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={goalDateText? new Date(goalDateText): new Date()}
                mode="date"
                display={Platform.OS==='ios'?'inline':'default'}
                onChange={(e, d)=>{ if(Platform.OS!=='ios') setShowDatePicker(false); if(e.type==='set' && d) setGoalDateText(d.toISOString().split('T')[0]); }}
              />
            )}

            <View style={styles.aiBox}>
              <View style={{flexDirection:'row',alignItems:'center',marginBottom:6}}>
                <Ionicons name="sparkles-outline" size={16} color={THEME.accent2}/>
                <Text style={{marginLeft:6,color:THEME.text,fontWeight:'700'}}>AI แนะนำ</Text>
              </View>
              <Text style={{color:THEME.text}}>คุณควรอ่านวันละ <Text style={{fontWeight:'800',color:THEME.accent2}}>{aiDailySuggestion||'-'}</Text> หน้า</Text>
              <Text style={{color:THEME.text}}>หรือ สัปดาห์ละ <Text style={{fontWeight:'800',color:THEME.accent2}}>{aiSuggestion.weekly||'-'}</Text> หน้า</Text>
              <Text style={{color:THEME.text}}>หรือ เดือนละ <Text style={{fontWeight:'800',color:THEME.accent2}}>{aiSuggestion.monthly||'-'}</Text> หน้า</Text>
              <Text style={{color:THEME.textDim,marginTop:4}}>เหลืออีก {remainingPages} หน้า ที่จะอ่านจบ</Text>
            </View>

            <View style={{flexDirection:'row',gap:10,marginTop:10}}>
              <TouchableOpacity style={[styles.modalBtn,{backgroundColor:'transparent',borderWidth:1,borderColor:THEME.stroke}]} onPress={()=>setGoalModalVisible(false)} activeOpacity={0.85}>
                <Text style={{fontWeight:'700',color:THEME.text}}>ยกเลิก</Text>
              </TouchableOpacity>
              <LinearGradient colors={GRAD_PILL} start={{x:0,y:0}} end={{x:1,y:0}} style={[styles.modalBtn,{borderRadius:12}]}>
                <TouchableOpacity onPress={handleSaveGoal} style={{flex:1,alignItems:'center',justifyContent:'center'}} activeOpacity={0.9}>
                  <Text style={{fontWeight:'800',color:'#0b1220'}}>บันทึกเป้าหมาย</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Edit Modal ===== */}
      <Modal visible={editModalVisible} transparent animationType="slide" onRequestClose={()=>setEditModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCardSolid}>
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
              <Text style={styles.modalTitle}>แก้ไขข้อมูลหนังสือ</Text>
              <TouchableOpacity onPress={()=>setEditModalVisible(false)}><Ionicons name="close" size={20} color={THEME.text}/></TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>ชื่อหนังสือ</Text>
            <TextInput style={styles.input} value={editTitle} onChangeText={setEditTitle} placeholder="กรอกชื่อหนังสือ" placeholderTextColor={THEME.textDim}/>
            <Text style={styles.modalLabel}>ชื่อผู้แต่ง</Text>
            <TextInput style={styles.input} value={editAuthor} onChangeText={setEditAuthor} placeholder="กรอกชื่อผู้แต่ง" placeholderTextColor={THEME.textDim}/>
            <Text style={styles.modalLabel}>จำนวนหน้าทั้งหมด</Text>
            <TextInput style={styles.input} value={editPages} onChangeText={setEditPages} keyboardType="numeric" placeholder="จำนวนหน้า" placeholderTextColor={THEME.textDim}/>

            <View style={{flexDirection:'row',gap:10,marginTop:10}}>
              <TouchableOpacity style={[styles.modalBtn,{backgroundColor:'transparent',borderWidth:1,borderColor:THEME.stroke}]} onPress={()=>setEditModalVisible(false)} activeOpacity={0.85}>
                <Text style={{fontWeight:'700',color:THEME.text}}>ยกเลิก</Text>
              </TouchableOpacity>
              <LinearGradient colors={GRAD_PILL} start={{x:0,y:0}} end={{x:1,y:0}} style={[styles.modalBtn,{borderRadius:12}]}>
                <TouchableOpacity onPress={handleSaveEdit} style={{flex:1,alignItems:'center',justifyContent:'center'}} activeOpacity={0.9}>
                  <Text style={{fontWeight:'800',color:'#0b1220'}}>บันทึกการแก้ไข</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Confirm delete cover ===== */}
      <FancyPopup
        visible={coverPopup.show}
        title="ลบรูปปก"
        message="ต้องการเอารูปปกออกจากหนังสือเล่มนี้หรือไม่?"
        onCancel={()=>setCoverPopup({show:false})}
        onConfirm={confirmRemoveCover}
        confirmText="ลบ"
        cancelText="ยกเลิก"
      />

      {/* ===== Toast OK ===== */}
      <ToastPopup
        visible={toast.visible}
        icon={toast.icon}
        color={toast.color}
        title={toast.title}
        message={toast.message}
        onClose={()=>setToast({...toast,visible:false})}
        primaryText="ตกลง"
      />

      {/* ===== Block Start ===== */}
      <BlockStartPopup
        visible={blockStart}
        onClose={()=>setBlockStart(false)}
        onOpenGoal={()=>{ setBlockStart(false); setGoalModalVisible(true); }}
        onOpenSchedule={()=>{ setBlockStart(false); navigation.navigate('ReadingScheduleEditor',{bookId}); }}
        needGoal={!hasDailyGoal}
        needSchedule={!hasSchedule}
      />
    </View>
  );
}

/* ================= Styles ================= */
const styles = StyleSheet.create({
  screen:{ flex:1, backgroundColor:THEME.bg },

  header:{
    paddingTop:(Platform.OS==='android' ? (StatusBar.currentHeight||0) : 0)+8,
    paddingBottom:12, paddingHorizontal:14,
    borderBottomWidth:1, borderColor:THEME.stroke,
    backgroundColor:THEME.bg, flexDirection:'row', alignItems:'center'
  },
  headerLeft:{ flexDirection:'row', alignItems:'center' },
  backText:{ marginLeft:8, color:THEME.text, fontWeight:'700' },

  scrollBody:{ padding:12, gap:12 },

  cardBorder:{
    borderRadius:18, padding:1,
    ...Platform.select({ ios:{shadowColor:THEME.accent2,shadowOpacity:0.25,shadowRadius:12,shadowOffset:{width:0,height:6}}, android:{elevation:0} }),
  },
  cardSolid:{ backgroundColor:THEME.cardSolid, borderWidth:1, borderColor:THEME.stroke, borderRadius:17, overflow:'hidden' },
  cardInnerPad:{ padding:16, alignItems:'center' },

  fabStack:{ position:'absolute', right:12, top:12, gap:10, alignItems:'flex-end' },
  fab:{ width:38, height:38, borderRadius:19, alignItems:'center', justifyContent:'center',
    ...Platform.select({ ios:{shadowColor:'#000',shadowOpacity:0.25,shadowRadius:8,shadowOffset:{width:0,height:4}}, android:{elevation:2} })
  },

  cover:{ width:170, height:220, borderRadius:14, backgroundColor:THEME.bg2, alignItems:'center', justifyContent:'center', marginBottom:12, overflow:'hidden' },
  coverImg:{ width:'100%', height:'100%', resizeMode:'cover' },
  coverAddBtn:{ position:'absolute', bottom:10, paddingHorizontal:12, paddingVertical:8, borderRadius:999, flexDirection:'row', alignItems:'center', gap:6, overflow:'hidden', backgroundColor:THEME.accent2 },
  coverAddText:{ color:'#0b1220', fontWeight:'800' },
  coverEditBtn:{ position:'absolute', right:8, bottom:8, paddingHorizontal:10, paddingVertical:6, borderRadius:999, flexDirection:'row', alignItems:'center', gap:6, overflow:'hidden', backgroundColor:THEME.accent2 },
  coverEditText:{ color:'#0b1220', fontWeight:'800', fontSize:12 },

  primaryBtn:{ width:'100%', borderRadius:12, overflow:'hidden', marginBottom:8 },
  primaryTap:{ paddingVertical:12, alignItems:'center', flexDirection:'row', justifyContent:'center', gap:6 },
  primaryBtnText:{ color:'#0b1220', fontWeight:'900' },

  quickRow:{ width:'100%', flexDirection:'row', gap:10, marginTop:6 },
  iconPillWrap:{ borderRadius:999, overflow:'hidden' },
  iconPillTap:{ paddingVertical:10, paddingHorizontal:14, alignItems:'center', justifyContent:'center' },

  title:{ fontSize:18, fontWeight:'900', color:THEME.text },
  author:{ marginTop:4, color:THEME.textDim },
  meta:{ color:THEME.textDim },

  grid:{ width:'100%', marginTop:12, flexDirection:'row', flexWrap:'wrap', gap:10 },
  statBox:{ width:'48%', backgroundColor:THEME.bg2, borderWidth:1, borderColor:THEME.stroke, borderRadius:12, padding:12 },
  statIconWrap:{ width:24, height:24, borderRadius:6, backgroundColor:'rgba(255,255,255,0.06)', alignItems:'center', justifyContent:'center', marginBottom:6 },
  statLabel:{ fontSize:12, color:THEME.textDim },
  statValue:{ marginTop:2, fontWeight:'800', color:THEME.text },

  progressLabel:{ fontWeight:'800', color:THEME.text, marginBottom:8, alignSelf:'flex-start' },
  progressBarBg:{ height:8, backgroundColor:'rgba(255,255,255,0.10)', borderRadius:999, overflow:'hidden' },
  progressBarFill:{ height:8, borderRadius:999 },
  progressRow:{ marginTop:6, flexDirection:'row', justifyContent:'space-between' },
  progressSmall:{ fontSize:12, color:THEME.textDim },

  sectionTitle:{ fontWeight:'900', color:THEME.text, alignSelf:'flex-start' },
  helper:{ color:THEME.textDim, alignSelf:'flex-start', marginTop:6, marginBottom:6 },
  input:{ width:'100%', borderWidth:1, borderColor:THEME.stroke, borderRadius:12, paddingHorizontal:12, paddingVertical:10, backgroundColor:THEME.bg2, marginBottom:10, color:THEME.text },

  secondaryBtn:{ width:'100%', borderRadius:12, overflow:'hidden' },
  secondaryTap:{ paddingVertical:12, alignItems:'center', flexDirection:'row', justifyContent:'center', gap:6 },
  secondaryBtnText:{ color:'#0b1220', fontWeight:'900', marginLeft:4 },

  center:{ flex:1, alignItems:'center', justifyContent:'center' },

  /* ===== Modals ===== */
  modalBackdrop:{ flex:1, backgroundColor:'rgba(0,0,0,0.45)', justifyContent:'center', padding:16 },
  modalCardSolid:{ backgroundColor:THEME.modalSolid, borderRadius:16, padding:16, borderWidth:1, borderColor:THEME.stroke },
  modalTitle:{ fontWeight:'900', color:THEME.text, fontSize:16 },
  modalLabel:{ color:THEME.text, fontWeight:'700', marginTop:10 },
  aiBox:{ marginTop:10, padding:10, borderRadius:12, backgroundColor:THEME.bg2, borderWidth:1, borderColor:THEME.stroke },
  modalBtn:{ flex:1, height:46, borderRadius:12, alignItems:'center', justifyContent:'center' },

  /* ===== Confirm delete styles ===== */
  popupOverlay:{ position:'absolute', left:0, right:0, top:0, bottom:0, backgroundColor:'rgba(0,0,0,0.55)', alignItems:'center', justifyContent:'center', padding:24 },
  popupGlow:{ position:'absolute', width:'80%', height:210, borderRadius:20, shadowOpacity:0.7, shadowRadius:24, shadowOffset:{width:0,height:0} },
  popupBorder:{ width:'100%', maxWidth:420, padding:1.2, borderRadius:18, borderWidth:1, borderColor:'rgba(255,255,255,0.08)' },
  popupCard:{ backgroundColor:THEME.cardSolid, borderRadius:17, borderWidth:1, borderColor:THEME.stroke, paddingVertical:16, paddingHorizontal:16 },
  popupBadge:{ alignSelf:'center', width:56, height:56, borderRadius:16, alignItems:'center', justifyContent:'center', marginTop:-34, marginBottom:8, shadowOpacity:0.8, shadowRadius:18, shadowOffset:{width:0,height:0}, borderWidth:1, borderColor:'rgba(255,255,255,0.12)' },
  popupTitle:{ color:THEME.text, fontWeight:'900', fontSize:16, textAlign:'center', marginBottom:4 },
  popupMessage:{ color:THEME.textDim, textAlign:'center', lineHeight:20 },
  popupBtnRow:{ marginTop:16, flexDirection:'row', justifyContent:'space-between', gap:12 },
  popupBtnGhost:{ flex:1, paddingVertical:11, paddingHorizontal:14, borderRadius:12, borderWidth:1.5, borderColor:'rgba(255,255,255,0.16)', backgroundColor:'rgba(255,255,255,0.04)', alignItems:'center' },
  popupBtnGhostText:{ color:THEME.text, fontWeight:'800' },
  popupBtnGrad:{ flex:1, borderRadius:12, overflow:'hidden', alignItems:'center' },
  popupBtnText:{ color:'#fff', fontWeight:'900', paddingVertical:11, paddingHorizontal:16, textAlign:'center' },

  /* ===== Toast / BlockStart ===== */
  toastOverlay:{ flex:1, backgroundColor:'rgba(0,0,0,0.45)', alignItems:'center', justifyContent:'center', padding:16 },
  toastBorder:{ width:'92%', maxWidth:420, borderRadius:16, padding:1, borderWidth:1, borderColor:'rgba(255,255,255,0.08)' },
  toastCard:{ backgroundColor:THEME.modalSolid, borderRadius:15, padding:16, borderWidth:1, borderColor:THEME.stroke },
  toastIcon:{ width:56, height:56, borderRadius:14, alignSelf:'center', alignItems:'center', justifyContent:'center', marginTop:-34, marginBottom:8, borderWidth:1, borderColor:'rgba(255,255,255,0.12)' },
  toastTitle:{ color:THEME.text, fontWeight:'900', textAlign:'center', fontSize:16 },
  toastMsg:{ color:THEME.textDim, textAlign:'center', marginTop:4, lineHeight:20 },
  toastBtn:{ marginTop:12, borderRadius:12, overflow:'hidden' },
  toastGhostBtn:{ height:44, borderRadius:12, borderWidth:1, borderColor:'rgba(255,255,255,0.18)', alignItems:'center', justifyContent:'center', flexDirection:'row' },

  /* checklist */
  checkWrap:{ marginTop:2, marginBottom:8, gap:6 },
  checkRow:{ flexDirection:'row', alignItems:'center', gap:8 },
  checkIcon:{ width:22, height:22, borderRadius:7, borderWidth:1, alignItems:'center', justifyContent:'center' },
  checkText:{ color:THEME.text, fontWeight:'700' },
});
