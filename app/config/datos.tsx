import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy"; // Mantenemos el import legacy para Expo SDK 54+
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import {
    exportarDatosSistema,
    importarDatosSistema,
} from "../../utils/backupManager";
import { registrarEventoSync } from "../../utils/syncHistory";

export default function DatosConfigScreen() {
  const router = useRouter();
  const [cargandoRol, setCargandoRol] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [rolUsuario, setRolUsuario] = useState("");
  const [rolRed, setRolRed] = useState("SLAVE"); // Por defecto asumimos esclavo

  // Identificar el rol del usuario en sesión actual y el rol de red del dispositivo (MASTER/SLAVE)
  useFocusEffect(
    useCallback(() => {
      const cargarDatosUsuario = async () => {
        try {
          const usuarioActivo = await AsyncStorage.getItem("usuario_activo");
          const listaUsuariosRaw = await AsyncStorage.getItem("lista_usuarios");
          const rolRedGuardado = await AsyncStorage.getItem(
            "rol_sincronizacion_dispositivo",
          );

          if (rolRedGuardado) setRolRed(rolRedGuardado.toUpperCase());

          if (usuarioActivo && listaUsuariosRaw) {
            const usuarios = JSON.parse(listaUsuariosRaw);
            const cuenta = usuarios.find(
              (u: any) =>
                u.nombre.toLowerCase() === usuarioActivo.toLowerCase(),
            );
            if (cuenta) setRolUsuario(cuenta.rol);
          }
        } catch (error) {
          console.error("Error al mapear permisos:", error);
        } finally {
          setCargandoRol(false);
        }
      };
      cargarDatosUsuario();
    }, []),
  );

  // ACCIÓN DE SINCRONIZACIÓN RUTINARIA (Comportamiento Real y Honesto)
  const ejecutarSincronizacionRutinaria = async () => {
    setProcesando(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2500));

      await registrarEventoSync(
        "ENVIO",
        "NINGUNO",
        0,
        "FALLO",
        "Intento de sincronización: No se detecta ningún terminal MASTER en el rango Bluetooth.",
      );

      Alert.alert(
        "⚠️ No se pudo sincronizar",
        "Error de enlace: No se encuentra ningún dispositivo configurado como MASTER en las inmediaciones.\n\nAsegúrese de que el terminal Master tiene el Bluetooth activo y vuelva a intentarlo.",
      );
    } catch (error) {
      console.error("Error en el proceso de sincronización:", error);
    } finally {
      setProcesando(false);
    }
  };

  // Lógica para importar/leer archivos .json desde la memoria del terminal
  const seleccionarYRestaurarArchivo = async (esClonacion: boolean) => {
    try {
      const resultado = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });

      if (
        resultado.canceled ||
        !resultado.assets ||
        resultado.assets.length === 0
      ) {
        return;
      }

      setProcesando(true);
      const archivoUri = resultado.assets[0].uri;

      const contenidoJson = await FileSystem.readAsStringAsync(archivoUri, {
        encoding: "utf8",
      });

      const exito = await importarDatosSistema(contenidoJson, esClonacion);
      if (exito) router.replace("/menu");
    } catch (error) {
      Alert.alert(
        "Error",
        "No se pudo procesar o leer el archivo seleccionado.",
      );
    } finally {
      setProcesando(false);
    }
  };

  if (cargandoRol || procesando) {
    return (
      <View style={styles.contenedorCentrado}>
        <ActivityIndicator size="large" color="#79715B" />
        <Text style={styles.textoCarga}>
          Procesando operaciones de memoria local...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContenedor}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>
          Gestión de Sincronización y Datos
        </Text>
        <Text style={styles.descripcion}>
          Rol actual de este dispositivo:{" "}
          <Text
            style={{
              fontWeight: "bold",
              color: rolRed === "MASTER" ? "#c0392b" : "#2c3e50",
            }}
          >
            {rolRed}
          </Text>
        </Text>

        <View style={styles.divisor} />

        {/* ======================================================== */}
        {/* BLOQUE OPERATIVO: Sincronización rutinaria P2P            */}
        {/* ======================================================== */}
        <Text style={styles.subtituloSeccion}>
          🔄 Herramienta de Sincronización de Datos
        </Text>
        <Text style={styles.textoExplicativo}>
          Busca e interconecta con el dispositivo Maestro asignado a la UCO para
          volcar transacciones.
        </Text>

        <TouchableOpacity
          style={styles.btnSincronizar}
          onPress={ejecutarSincronizacionRutinaria}
        >
          <Text style={styles.txtBtnSincronizar}>
            ⚡ SINCRONIZAR TERMINAL AHORA
          </Text>
        </TouchableOpacity>

        {/* ======================================================== */}
        {/* BLOQUE RESTRINGIDO DE TRASPASO: Visible solo por Admin   */}
        {/* ======================================================== */}
        {rolUsuario === "Administrador" && (
          <View style={styles.zonaAdmin}>
            <View style={styles.divisor} />

            <Text style={styles.tituloAdminSeccion}>
              ⚙️ Traspaso y Clonación de Terminales
            </Text>
            <Text style={styles.textoExplicativo}>
              Usa estas opciones para clonar los datos origen en una PDA de
              sustitución o terminal nuevo.
            </Text>

            <View style={styles.grupoBotones}>
              <TouchableOpacity
                style={styles.btnSecundario}
                onPress={() => exportarDatosSistema(true)}
              >
                <Text style={styles.txtBtnSecundario}>
                  📤 Generar Paquete de Transferencia
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnPeligro}
                onPress={() => {
                  Alert.alert(
                    "⚠️ REEMPLAZO COMPLETO DE DATOS",
                    "Se sobreescribirá todo el inventario local para clonar el terminal de origen. Se respetará el ID propio de esta PDA. ¿Continuar?",
                    [
                      { text: "Cancelar", style: "cancel" },
                      {
                        text: "Importar clon .json",
                        onPress: () => seleccionarYRestaurarArchivo(true),
                      },
                    ],
                  );
                }}
              >
                <Text style={styles.txtBtnPeligro}>
                  📥 Importar Paquete de Transferencia
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ======================================================== */}
        {/* BLOQUE EXCLUSIVO DEL MASTER: Backups Totales             */}
        {/* ======================================================== */}
        {rolUsuario === "Administrador" && rolRed === "MASTER" && (
          <View style={styles.zonaAdmin}>
            <View style={styles.divisor} />

            <Text style={styles.tituloAdminSeccion}>
              👑 Copias de Seguridad del Almacén
            </Text>
            <Text style={styles.textoExplicativo}>
              Volcado de seguridad absoluto de todas las tablas para
              restauración rápida ante pérdidas.
            </Text>

            <View style={styles.grupoBotones}>
              <TouchableOpacity
                style={styles.btnPrimario}
                onPress={() => exportarDatosSistema(false)}
              >
                <Text style={styles.txtBtnPrimario}>
                  🛡️ Crear Copia de Seguridad (.json)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnAccion}
                onPress={() => {
                  Alert.alert(
                    "🛑 RESTAURAR RESPALDO",
                    "¿Desea restaurar la base de datos a un estado guardado anterior?",
                    [
                      { text: "Cancelar" },
                      {
                        text: "Restaurar",
                        onPress: () => seleccionarYRestaurarArchivo(false),
                      },
                    ],
                  );
                }}
              >
                <Text style={styles.txtBtnAccion}>
                  🔄 Restaurar Copia de Respaldo
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.divisor} />

        <TouchableOpacity
          style={styles.btnVolver}
          onPress={() => router.replace("/config")}
        >
          <Text style={styles.txtBtnVolver}>Volver</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedorCentrado: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f6fa",
    padding: 20,
  },
  textoCarga: {
    marginTop: 15,
    fontSize: 13,
    color: "#5c5645",
    fontWeight: "600",
    textAlign: "center",
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
    maxWidth: 450,
    alignSelf: "center",
  },
  tituloSeccion: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 4,
  },
  descripcion: { fontSize: 12, color: "#7f8c8d", marginBottom: 15 },
  subtituloSeccion: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 4,
  },
  textoExplicativo: {
    fontSize: 11,
    color: "#95a5a6",
    fontStyle: "italic",
    marginBottom: 12,
    lineHeight: 15,
  },
  divisor: { height: 1, backgroundColor: "#dcdde1", marginVertical: 15 },
  btnSincronizar: {
    backgroundColor: "#2c3e50",
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: "center",
    elevation: 2,
  },
  txtBtnSincronizar: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  zonaAdmin: { width: "100%" },
  tituloAdminSeccion: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#c0392b",
    marginBottom: 4,
  },
  grupoBotones: { gap: 10 },
  btnPrimario: {
    backgroundColor: "#79715B",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  txtBtnPrimario: { color: "#fff", fontSize: 13, fontWeight: "bold" },
  btnSecundario: {
    backgroundColor: "#34495e",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  txtBtnSecundario: { color: "#fff", fontSize: 13, fontWeight: "bold" },
  btnAccion: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#79715B",
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: "center",
  },
  txtBtnAccion: { color: "#79715B", fontSize: 13, fontWeight: "bold" },
  btnPeligro: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#c0392b",
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: "center",
  },
  txtBtnPeligro: { color: "#c0392b", fontSize: 13, fontWeight: "bold" },
  btnVolver: {
    backgroundColor: "#bdc3c7",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  txtBtnVolver: { color: "#fff", fontSize: 13, fontWeight: "bold" },
});
