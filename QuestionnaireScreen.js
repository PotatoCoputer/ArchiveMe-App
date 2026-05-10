import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const THEME = {
  bg1: '#0b1020',
  bg2: '#101a3a',
  bg3: '#0c2b3a',
  text: '#eaf6ff',
  sub: '#a7d8f0',
  dim: 'rgba(234,246,255,0.7)',
  card: 'rgba(255,255,255,0.06)',
  cardBorder: 'rgba(173,235,255,0.22)',
  primary: '#22d3ee',
  primary2: '#60a5fa',
  success1: '#34d399',
  success2: '#22c55e',
};
const GRAD_BG = [THEME.bg1, THEME.bg2, THEME.bg3];
const GRAD_PRIMARY = [THEME.primary2, THEME.primary];
const GRAD_SUCCESS = [THEME.success1, THEME.success2];

function FancyPopup({ visible, title, message, confirmText = 'ตกลง', onClose, onConfirm, success }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.popupOverlay}>
        <View style={[styles.popupGlow, { shadowColor: (success ? '#22c55e' : THEME.primary) + '66' }]} />
        <LinearGradient colors={['#21314f', '#182341']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.popupBorder}>
          <View style={styles.popupCard}>
            <View
              style={[
                styles.popupBadge,
                { backgroundColor: 'rgba(255,255,255,0.06)', shadowColor: (success ? '#22c55e' : THEME.primary) + '77' },
              ]}
            >
              <Ionicons name={success ? 'sparkles-outline' : 'information-circle-outline'} size={24} color={success ? '#22c55e' : THEME.primary} />
            </View>

            <Text style={styles.popupTitle}>{title}</Text>
            {!!message && <Text style={styles.popupMsg}>{message}</Text>}

            <View style={styles.popupBtnRowSingle}>
              <LinearGradient colors={success ? GRAD_SUCCESS : GRAD_PRIMARY} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.popupBtnGrad}>
                <TouchableOpacity onPress={onConfirm || onClose} activeOpacity={0.9}>
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

export default function QuestionnaireScreen() {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({
    genre: '', readingTime: '', pagesPerHour: '', timePerDay: '', goal: '',
  });

  const [donePopup, setDonePopup] = useState(false);
  const navigation = useNavigation();

  const questions = [
    { question: 'คุณชอบอ่านหนังสือประเภทใดมากที่สุด?', options: ['นวนิยาย', 'ความรู้ทั่วไป', 'การพัฒนาตนเอง', 'วิทยาศาสตร์/เทคโนโลยี', 'ธุรกิจ/การเงิน', 'อื่นๆ'], key: 'genre' },
    { question: 'คุณมักอ่านหนังสือในช่วงเวลาใดของวัน?', options: ['เช้า', 'กลางวัน', 'เย็น', 'ก่อนนอน'], key: 'readingTime' },
    { question: 'โดยเฉลี่ย คุณอ่านหนังสือได้กี่หน้าต่อชั่วโมง?', options: ['น้อยกว่า 10 หน้า', '10-20 หน้า', '21-30 หน้า', '31-50 หน้า', '51-100 หน้า', 'มากกว่า 100 หน้า'], key: 'pagesPerHour' },
    { question: 'คุณต้องการใช้เวลาอ่านหนังสือกี่นาทีต่อวัน?', options: ['15 นาที', '30 นาที', '45 นาที', '1 ชั่วโมง', '1.5 ชั่วโมง', '2 ชั่วโมง', 'มากกว่า 2 ชั่วโมง'], key: 'timePerDay' },
    { question: 'คุณมีเป้าหมายในการอ่านหนังสือหรือไม่?\n(เช่น จำนวนเล่มต่อเดือน)', isTextInput: true, key: 'goal' },
  ];

  const handleOptionSelect = (value) => {
    const key = questions[questionIndex].key;
    setAnswers(prev => ({ ...prev, [key]: value }));
    if (questionIndex < questions.length - 1) setQuestionIndex(i => i + 1);
    else handleFinish();
  };

  const handleFinish = () => {
    setDonePopup(true);
  };

  const handleBack = () => { if (questionIndex > 0) setQuestionIndex(i => i - 1); };
  const current = questions[questionIndex];

  return (
    <LinearGradient colors={GRAD_BG} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#223053', '#1a2547']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.cardBorder}>
          <View style={styles.card}>
            <Text style={styles.title}>แบบสอบถามการอ่าน</Text>
            <Text style={styles.subtitle}>กรุณาตอบคำถามเพื่อให้อ่านหนังสือที่เหมาะกับคุณ</Text>

            {/* Progress */}
            <View style={styles.progressBar}>
              <LinearGradient
                colors={GRAD_PRIMARY}
                start={{x:0,y:0}} end={{x:1,y:0}}
                style={[styles.progress, { width: `${((questionIndex + 1) / questions.length) * 100}%` }]}
              />
            </View>

            <Text style={styles.question}>{current.question}</Text>

            {!current.isTextInput ? (
              <View>
                {current.options.map((option, index) => (
                  <LinearGradient key={index} colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.04)']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.optionWrap}>
                    <TouchableOpacity style={styles.optionButton} activeOpacity={0.9} onPress={() => handleOptionSelect(option)}>
                      <Text style={styles.optionText}>{option}</Text>
                      <Ionicons name="chevron-forward" size={16} color={THEME.sub} />
                    </TouchableOpacity>
                  </LinearGradient>
                ))}
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.textInput}
                  placeholder="พิมพ์คำตอบของคุณที่นี่..."
                  placeholderTextColor={THEME.dim}
                  value={answers.goal}
                  onChangeText={(text) => setAnswers(prev => ({ ...prev, goal: text }))}
                  multiline
                />
                <LinearGradient colors={GRAD_PRIMARY} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.nextButtonGrad}>
                  <TouchableOpacity style={styles.nextButton} onPress={handleFinish} activeOpacity={0.9}>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#0b1020" />
                    <Text style={styles.nextText}>เสร็จสิ้น</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </>
            )}

            {questionIndex > 0 && (
              <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.85}>
                <Ionicons name="arrow-back" size={16} color={THEME.text} />
                <Text style={styles.backText}>ย้อนกลับ</Text>
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>
      </ScrollView>

      <FancyPopup
        visible={donePopup}
        title="แบบสอบถามเสร็จสิ้น"
        message="เราจะใช้คำตอบของคุณเพื่อเสนอแผนการอ่านที่เหมาะสม"
        success
        confirmText="ไปหน้าเมนูหลัก"
        onConfirm={() => {
          setDonePopup(false);
          navigation.replace('Main');
        }}
        onClose={() => setDonePopup(false)}
      />
    </LinearGradient>
  );
}

/* ===== Styles ===== */
const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 18 },
  cardBorder: {
    borderRadius: 18, padding: 1.2,
    borderWidth: 1, borderColor: THEME.cardBorder,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 },
  },
  card: {
    backgroundColor: THEME.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 16,
  },
  title: { fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 6, color: THEME.text },
  subtitle: { textAlign: 'center', color: THEME.sub, marginBottom: 14 },

  question: { fontSize: 16, fontWeight: '800', marginBottom: 12, color: THEME.text },

  progressBar: { height: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, marginBottom: 14, overflow: 'hidden' },
  progress: { height: '100%', borderRadius: 999 },

  optionWrap: {
    borderRadius: 12, padding: 1, marginBottom: 10,
    borderWidth: 1, borderColor: THEME.cardBorder,
  },
  optionButton: {
    backgroundColor: 'rgba(6,14,28,0.55)',
    borderRadius: 11,
    paddingVertical: 12, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  optionText: { color: THEME.text, fontSize: 15, fontWeight: '700' },

  textInput: {
    borderWidth: 1, borderColor: THEME.cardBorder, borderRadius: 12,
    padding: 12, minHeight: 110, marginBottom: 12,
    color: THEME.text, backgroundColor: 'rgba(255,255,255,0.05)',
  },

  nextButtonGrad: { borderRadius: 12, overflow: 'hidden' },
  nextButton: { paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  nextText: { color: '#0b1020', fontWeight: '900' },

  backButton: { marginTop: 12, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  backText: { color: THEME.text, fontWeight: '800' },

  popupOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  popupGlow: {
    position: 'absolute',
    width: '80%', height: 210, borderRadius: 20,
    shadowOpacity: 0.7, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
  },
  popupBorder: { width: '100%', maxWidth: 500, padding: 1.2, borderRadius: 18, borderWidth: 1, borderColor: THEME.cardBorder },
  popupCard: {
    backgroundColor: 'rgba(12,24,48,0.85)',
    borderRadius: 17, borderWidth: 1, borderColor: 'rgba(173,235,255,0.28)',
    paddingVertical: 16, paddingHorizontal: 16,
  },
  popupBadge: {
    alignSelf: 'center', width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginTop: -34, marginBottom: 8,
    shadowOpacity: 0.8, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  popupTitle: { color: THEME.text, fontWeight: '900', fontSize: 16, textAlign: 'center', marginBottom: 4 },
  popupMsg: { color: THEME.sub, textAlign: 'center', lineHeight: 20 },
  popupBtnRowSingle: { marginTop: 16, flexDirection: 'row', justifyContent: 'center' },
  popupBtnGrad: { borderRadius: 12, overflow: 'hidden', alignItems: 'center' },
  popupBtnText: { color: '#0b1020', fontWeight: '900', paddingVertical: 11, paddingHorizontal: 16, textAlign: 'center' },
});
