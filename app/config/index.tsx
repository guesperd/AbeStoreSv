import { useRouter } from "expo-router";
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export default function MenuConfigScreen() {
  const router = useRouter();

  const moduloEnConstruccion = (nombre: string) => {
    Alert.alert(
      "Módulo en Desarrollo",
      `El apartado de ${nombre} se configurará en las próximas fases.`,
    );
  };

  return (
    <View style={styles.pantallaCompleta}>
      <View style={styles.cabecera}>
        <TouchableOpacity
          style={styles.botonVolver}
          onPress={() => router.replace("/menu")}
        >
          <Text style={styles.textoVolver}>⬅ Volver al Menú</Text>
        </TouchableOpacity>
        <Text style={styles.tituloPantalla}>Ajustes del Sistema</Text>
      </View>

      <ScrollView contentContainerStyle={styles.contenedorOpciones}>
        {/* Opción 1: Cuentas de Usuario */}
        <TouchableOpacity
          style={styles.tarjetaAjuste}
          onPress={() => router.push("/config/usuarios")}
        >
          <Text style={styles.icono}>👥</Text>
          <View style={styles.bloqueTexto}>
            <Text style={styles.tituloAjuste}>Cuentas de Usuario</Text>
            <Text style={styles.descripcionAjuste}>
              Crear, eliminar, cambiar contraseñas y gestionar los roles de
              acceso.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Opción 2: Dispositivo de Escaneo */}
        <TouchableOpacity
          style={styles.tarjetaAjuste}
          onPress={() => router.push("/config/escaner")}
        >
          <Text style={styles.icono}>📟</Text>
          <View style={styles.bloqueTexto}>
            <Text style={styles.tituloAjuste}>Dispositivo de Escaneo</Text>
            <Text style={styles.descripcionAjuste}>
              Configurar si se usa la cámara del móvil o el lector láser de una
              PDA (Skorpio X5).
            </Text>
          </View>
        </TouchableOpacity>

        {/* Opción 3: Gestión de Almacén */}
        <TouchableOpacity
          style={styles.tarjetaAjuste}
          onPress={() => router.push("/config/almacen")}
        >
          <Text style={styles.icono}>🏢</Text>
          <View style={styles.bloqueTexto}>
            <Text style={styles.tituloAjuste}>Gestión de Almacén</Text>
            <Text style={styles.descripcionAjuste}>
              Configuración de departamentos, zonas físicas y terminales Sile.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Opción 4: Stock */}
        <TouchableOpacity
          style={styles.tarjetaAjuste}
          onPress={() => moduloEnConstruccion("Stock")}
        >
          <Text style={styles.icono}>📊</Text>
          <View style={styles.bloqueTexto}>
            <Text style={styles.tituloAjuste}>Stock e Inventario</Text>
            <Text style={styles.descripcionAjuste}>
              Parámetros de cuadre de mercancía y sincronización de existencias.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Opción 5: Datos de Guardado (ENRUTADO ACTIVO) */}
        <TouchableOpacity
          style={styles.tarjetaAjuste}
          onPress={() => router.push("/config/datos")}
        >
          <Text style={styles.icono}>💾</Text>
          <View style={styles.bloqueTexto}>
            <Text style={styles.tituloAjuste}>Datos de Guardado</Text>
            <Text style={styles.descripcionAjuste}>
              Copias de seguridad automáticas, exportación de archivos y
              sincronización Bluetooth.
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pantallaCompleta: { flex: 1, backgroundColor: "#f5f6fa" },
  cabecera: {
    backgroundColor: "#2c3e50",
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  botonVolver: { marginBottom: 10 },
  textoVolver: { color: "#3498db", fontSize: 15, fontWeight: "bold" },
  tituloPantalla: { fontSize: 24, fontWeight: "bold", color: "#fff" },
  contenedorOpciones: { padding: 20, gap: 15 },
  tarjetaAjuste: {
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e1e1e1",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  icono: { fontSize: 32, marginRight: 15 },
  bloqueTexto: { flex: 1 },
  tituloAjuste: { fontSize: 16, fontWeight: "bold", color: "#2c3e50" },
  descripcionAjuste: { fontSize: 12, color: "#7f8c8d", marginTop: 3 },
});
