import * as NavigationBar from "expo-navigation-bar";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { Platform, StatusBar } from "react-native";

export default function RootLayout() {
  useEffect(() => {
    // Solo actuamos en Android para evitar los avisos de incompatibilidad
    if (Platform.OS === "android") {
      const configurarPantallaCompletaInmersiva = async () => {
        try {
          // Con edgeToEdge activo, solo necesitamos decirle que oculte la barra de navegación.
          // El propio sistema operativo Android se encarga de que sea transparente y "sticky"
          // por debajo de la aplicación de forma nativa.
          await NavigationBar.setVisibilityAsync("hidden");
        } catch (error) {
          console.log("Error al ocultar la barra de navegación:", error);
        }
      };

      configurarPantallaCompletaInmersiva();
    }
  }, []);

  return (
    <>
      {/* Ocultamos la barra superior de Android de forma limpia */}
      <StatusBar hidden={true} translucent={true} barStyle="light-content" />

      {/* Tu enrutador con Stack original intacto */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="menu" />
      </Stack>
    </>
  );
}
