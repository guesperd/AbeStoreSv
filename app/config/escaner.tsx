import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { registrarEventoSync } from "../../utils/syncHistory";

export default function EscanerConfigScreen() {
  const router = useRouter();

  const [cargando, setCargando] = useState(true);
  const [rolUsuario, setRolUsuario] = useState("");
  const [claveAdminCorrecta, setClaveAdminCorrecta] = useState(""); // Contraseña real de la sesión activa

  // Estados de configuración de AbeStoreSv
  const [dispositivoEscaneo, setDispositivoEscaneo] =
    useState("android_camara");
  const [idDispositivo, setIdDispositivo] = useState("");
  const [rolRed, setRolRed] = useState<"MASTER" | "SLAVE">("SLAVE");

  // Estados para el Modal de contraseña (seguro para Android/Skorpio)
  const [modalVisible, setModalVisible] = useState(false);
  const [inputPassword, setInputPassword] = useState("");

  useFocusEffect(
    useCallback(() => {
      const cargarAjustes = async () => {
        try {
          // 1. Recuperamos el operario en sesión y la lista completa
          const usuarioActivo = await AsyncStorage.getItem("usuario_activo");
          const listaUsuariosRaw = await AsyncStorage.getItem("lista_usuarios");

          if (usuarioActivo && listaUsuariosRaw) {
            const usuarios = JSON.parse(listaUsuariosRaw);

            // BUSQUEDA CRÍTICA: Mapeamos EXACTAMENTE al usuario logueado en este instante
            const cuentaActual = usuarios.find(
              (u: any) =>
                u.nombre.trim().toLowerCase() ===
                usuarioActivo.trim().toLowerCase(),
            );

            if (cuentaActual) {
              setRolUsuario(cuentaActual.rol); // Guardamos su rol ('Administrador', etc.)

              // CORRECCIÓN KEY: Cambiamos .clave por .contrasena para acoplarlo con tu index.tsx
              setClaveAdminCorrecta(cuentaActual.contrasena);
            }
          }

          // 2. Cargar configuraciones previas de hardware y rol de red
          const scanConfig = await AsyncStorage.getItem("dispositivo_escaneo");
          if (scanConfig) setDispositivoEscaneo(scanConfig);

          const idGuardado = await AsyncStorage.getItem("id_dispositivo_local");
          if (idGuardado) setIdDispositivo(idGuardado);

          const rolRedGuardado = await AsyncStorage.getItem(
            "rol_sincronizacion_dispositivo",
          );
          if (rolRedGuardado === "MASTER" || rolRedGuardado === "SLAVE") {
            setRolRed(rolRedGuardado);
          }
        } catch (error) {
          console.error(
            "Error al mapear la configuración del terminal:",
            error,
          );
        } finally {
          setCargando(false);
        }
      };

      cargarAjustes();
    }, []),
  );

  // CONTROL 1: CAMBIAR A MASTER (De Esclavo a Maestro con alertas)
  const presionarMaster = () => {
    if (rolRed === "MASTER") {
      Alert.alert("Aviso", "Este dispositivo ya está configurado como MASTER.");
      return;
    }

    Alert.alert(
      "⚠️ ADVERTENCIA CRÍTICA",
      "Está a punto de configurar este dispositivo como MASTER (Maestro).\n\nSOLO puede existir UN dispositivo Master en todo el almacén. Si ya hay otro, las bases de datos entrarán en conflicto.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Entendido, Continuar",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "🛑 CONFIRMACIÓN FINAL",
              "¿Está absolutamente seguro de que ninguna otra PDA está actuando como Master?",
              [
                { text: "No, verificar", style: "cancel" },
                {
                  text: "Sí, activar Master",
                  onPress: () => setRolRed("MASTER"),
                },
              ],
            );
          },
        },
      ],
    );
  };

  // CONTROL 2: CAMBIAR A SLAVE (De Maestro a Esclavo pidiendo clave)
  const presionarSlave = () => {
    if (rolRed === "SLAVE") {
      return; // Si ya es esclavo, el botón responde de forma estática normal
    }

    // Si era MASTER y quiere bajar a SLAVE, limpiamos el input y abrimos modal
    setInputPassword("");
    setModalVisible(true);
  };

  // ACCIÓN: VERIFICACIÓN DEL MODAL DE CONTROL DE ACCESO
  const verificarPasswordDegradacion = () => {
    // Verificamos de forma segura contra la propiedad correcta
    if (inputPassword === claveAdminCorrecta && claveAdminCorrecta !== "") {
      setRolRed("SLAVE");
      setModalVisible(false);
      Alert.alert(
        "Estado Cambiado",
        "El dispositivo ha sido degradado a Slave correctamente.",
      );
    } else {
      Alert.alert(
        "❌ Error de Validación",
        "Contraseña de Administrador incorrecta. El terminal sigue protegido como MASTER.",
      );
    }
  };

  const guardarConfiguracion = async () => {
    if (rolUsuario === "Administrador" && idDispositivo.trim() === "") {
      Alert.alert(
        "Faltan datos",
        "Por favor, asigna un identificador único a este dispositivo.",
      );
      return;
    }

    try {
      await AsyncStorage.setItem("dispositivo_escaneo", dispositivoEscaneo);

      if (rolUsuario === "Administrador") {
        const idLimpio = idDispositivo.trim().toUpperCase();
        await AsyncStorage.setItem("id_dispositivo_local", idLimpio);
        await AsyncStorage.setItem("rol_sincronizacion_dispositivo", rolRed);

        // Dejamos constancia en el histórico global para la sincronización P2P
        await registrarEventoSync("uco_receptora", "MODIFICAR", {
          id_dispositivo_local: idLimpio,
          rol_sincronizacion: rolRed,
        });
      }

      Alert.alert(
        "Ajustes Guardados",
        "La configuración del terminal se ha actualizado correctamente.",
      );
      router.replace("/config");
    } catch (error) {
      Alert.alert("Error", "No se pudieron salvar los datos.");
    }
  };

  if (cargando) {
    return (
      <View style={styles.contenedorCentrado}>
        <ActivityIndicator size="large" color="#79715B" />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContenedor}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>Configuración de Hardware</Text>

        {/* PARTE COMÚN: Hardware de Escaneo */}
        <Text style={styles.label}>Dispositivo de captura principal:</Text>
        <View style={styles.contenedorSelector}>
          <TouchableOpacity
            style={[
              styles.opcionBot,
              dispositivoEscaneo === "android_camara" && styles.opcionActiva,
            ]}
            onPress={() => setDispositivoEscaneo("android_camara")}
          >
            <Text
              style={
                dispositivoEscaneo === "android_camara"
                  ? styles.txtActivo
                  : styles.txtInactivo
              }
            >
              📱 Cámara Móvil
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.opcionBot,
              dispositivoEscaneo === "skorpio_laser" && styles.opcionActiva,
            ]}
            onPress={() => setDispositivoEscaneo("skorpio_laser")}
          >
            <Text
              style={
                dispositivoEscaneo === "skorpio_laser"
                  ? styles.txtActivo
                  : styles.txtInactivo
              }
            >
              📟 Láser Skorpio
            </Text>
          </TouchableOpacity>
        </View>

        {/* PARTE RESTRINGIDA: Gestión de Red Local (Solo Administradores) */}
        {rolUsuario === "Administrador" && (
          <View style={styles.bloqueAdmin}>
            <View style={styles.divisor} />
            <Text style={styles.tituloAdmin}>
              ⚙️ Sincronización Bluetooth (Rol Admin)
            </Text>

            <Text style={styles.label}>Identificador de este Terminal:</Text>
            <TextInput
              style={styles.input}
              value={idDispositivo}
              onChangeText={setIdDispositivo}
              placeholder="Ej: PDA-01"
              placeholderTextColor="#95a5a6"
              autoCapitalize="characters"
            />

            <Text style={styles.label}>Rol en la Sincronización Local:</Text>
            <View style={styles.contenedorSelector}>
              {/* BOTÓN SLAVE */}
              <TouchableOpacity
                style={[
                  styles.opcionBot,
                  rolRed === "SLAVE" && styles.opcionActiva,
                ]}
                onPress={presionarSlave}
              >
                <Text
                  style={
                    rolRed === "SLAVE" ? styles.txtActivo : styles.txtInactivo
                  }
                >
                  Slave (Esclavo)
                </Text>
              </TouchableOpacity>

              {/* BOTÓN MASTER */}
              <TouchableOpacity
                style={[
                  styles.opcionBot,
                  rolRed === "MASTER" && styles.opcionMasterActiva,
                ]}
                onPress={presionarMaster}
              >
                <Text
                  style={
                    rolRed === "MASTER" ? styles.txtActivo : styles.txtInactivo
                  }
                >
                  👑 Master (Maestro)
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.textoExplicativo}>
              {rolRed === "MASTER"
                ? "El Maestro consolida las bases de datos de todos los terminales vía Bluetooth."
                : "El Esclavo envía sus cambios locales al terminal Maestro configurado."}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.btnGuardar}
          onPress={guardarConfiguracion}
        >
          <Text style={styles.txtBtnGuardar}>Aplicar y Guardar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnVolver}
          onPress={() => router.replace("/config")}
        >
          <Text style={styles.txtBtnVolver}>Volver</Text>
        </TouchableOpacity>
      </View>

      {/* --- MODAL SEGURO DE CONTRASEÑA --- */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.capaFondoModal}>
          <View style={styles.cajaModal}>
            <Text style={styles.tituloModal}>🔒 AUTENTICACIÓN REQUERIDA</Text>
            <Text style={styles.textoModal}>
              Está a punto de desactivar el terminal MAESTRO central.{"\n"}
              {"\n"}
              Introduzca la contraseña de su cuenta de Administrador para
              confirmar la acción:
            </Text>

            <TextInput
              style={styles.inputModalPassword}
              secureTextEntry={true}
              value={inputPassword}
              onChangeText={setInputPassword}
              placeholder="Contraseña Administrador"
              placeholderTextColor="#95a5a6"
            />

            <View style={styles.filaBotonesModal}>
              <TouchableOpacity
                style={[styles.btnModal, styles.btnModalCancelar]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.txtBtnVolver}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnModal, styles.btnModalConfirmar]}
                onPress={verificarPasswordDegradacion}
              >
                <Text style={styles.txtActivo}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedorCentrado: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f6fa",
  },
  scrollContenedor: {
    flexGrow: 1,
    backgroundColor: "#f5f6fa",
    padding: 20,
    justifyContent: "center",
  },
  tarjeta: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    elevation: 4,
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  tituloSeccion: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 15,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#7f8c8d",
    marginTop: 15,
    marginBottom: 6,
  },
  contenedorSelector: { flexDirection: "row", gap: 10, marginBottom: 5 },
  opcionBot: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dcdde1",
  },
  opcionActiva: { backgroundColor: "#79715B", borderColor: "#5c5645" },
  opcionMasterActiva: { backgroundColor: "#c0392b", borderColor: "#962d22" },
  txtActivo: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  txtInactivo: { color: "#7f8c8d", fontWeight: "500", fontSize: 13 },
  divisor: { height: 1, backgroundColor: "#dcdde1", marginVertical: 20 },
  bloqueAdmin: { width: "100%" },
  tituloAdmin: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#c0392b",
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#dcdde1",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#2c3e50",
  },
  textoExplicativo: {
    fontSize: 11,
    color: "#95a5a6",
    fontStyle: "italic",
    marginTop: 8,
    paddingHorizontal: 4,
  },
  btnGuardar: {
    backgroundColor: "#27ae60",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 30,
  },
  txtBtnGuardar: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  btnVolver: {
    backgroundColor: "#bdc3c7",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  txtBtnVolver: { color: "#fff", fontSize: 14, fontWeight: "bold" },

  // ESTILOS DEL MODAL DE AUTENTICACIÓN
  capaFondoModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  cajaModal: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 340,
    elevation: 10,
    alignItems: "center",
  },
  tituloModal: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#c0392b",
    marginBottom: 12,
  },
  textoModal: {
    fontSize: 13,
    color: "#34495e",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 18,
  },
  inputModalPassword: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#dcdde1",
    borderRadius: 8,
    padding: 12,
    width: "100%",
    fontSize: 14,
    color: "#2c3e50",
    textAlign: "center",
    marginBottom: 20,
  },
  filaBotonesModal: { flexDirection: "row", gap: 10, width: "100%" },
  btnModal: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  btnModalCancelar: { backgroundColor: "#bdc3c7" },
  btnModalConfirmar: { backgroundColor: "#c0392b" },
});
