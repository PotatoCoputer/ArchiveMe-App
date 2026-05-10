import React from "react";
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItemList,
  DrawerItem,
} from "@react-navigation/drawer";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, StyleSheet, Alert } from "react-native";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";

import AdminDashboardScreen from "./AdminDashboardScreen";
import ManageUsersScreen from "./ManageUsersScreen";
import ReadingStatsScreen from "./ReadingStatsScreen";


const Drawer = createDrawerNavigator();

function CustomDrawerContent(props) {
  const handleLogout = () => {
    Alert.alert("ออกจากระบบ", "คุณต้องการออกจากระบบใช่หรือไม่?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ออกจากระบบ",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut(auth);
            props.navigation.replace("Login");
          } catch (e) {
            console.log("Logout error:", e);
          }
        },
      },
    ]);
  };

  return (
    <DrawerContentScrollView {...props}>
      <View style={styles.drawerHeader}>
        <Ionicons name="shield-checkmark-outline" size={32} color="#6366f1" />
        <Text style={styles.appName}>Admin Panel</Text>
      </View>
      <DrawerItemList {...props} />
      <DrawerItem
        label="ออกจากระบบ"
        labelStyle={{ fontSize: 15, color: "#ef4444", fontWeight: "bold" }}
        icon={({ size }) => (
          <Ionicons name="log-out-outline" size={size} color="#ef4444" />
        )}
        onPress={handleLogout}
      />
    </DrawerContentScrollView>
  );
}

export default function AdminDrawer() {
  return (
    <Drawer.Navigator
      initialRouteName="Dashboard"
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: true,
        drawerActiveTintColor: "#6366f1",
        drawerLabelStyle: { fontSize: 15 },
      }}
    >
      <Drawer.Screen
        name="Dashboard"
        component={AdminDashboardScreen}
        options={{
          title: "แดชบอร์ด",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="grid" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="Users"
        component={ManageUsersScreen}
        options={{
          title: "จัดการผู้ใช้",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="Stats"
        component={ReadingStatsScreen}
        options={{
          title: "สถิติการอ่าน",
          drawerIcon: ({ color, size }) => (
            <Ionicons name="bar-chart" size={size} color={color} />
          ),
        }}
      />
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 10,
  },
  appName: {
    fontSize: 18,
    fontWeight: "700",
    marginLeft: 10,
    color: "#111827",
  },
});