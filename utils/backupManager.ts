import AsyncStorage from "@react-native-async-storage/async-storage";
// 🌟 CORRECCIÓN: Importamos desde la ruta legacy compatible con Expo SDK 54+
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";

const CLAVES_SISTEMA = [
  "lista_usuarios",
  "uco_receptora",
  "inventario_productos",
  "bultos_escaneados",
  "historico_sincronizacion_bluetooth",
];

/**
 * CREAR COPIA DE SEGURIDAD TOTAL / CLONACIÓN
 */
export const exportarDatosSistema = async (esClonacion: boolean = false) => {
  try {
    const paqueteData: Record<string, any> = {};

    for (const clave of CLAVES_SISTEMA) {
      const valor = await AsyncStorage.getItem(clave);

      if (valor && valor !== "undefined" && valor !== "null") {
        try {
          paqueteData[clave] = JSON.parse(valor);
        } catch (e) {
          console.warn(
            `[BACKUP] Alerta: La clave [${clave}] contiene datos inválidos planos. Se exporta como texto.`,
          );
          paqueteData[clave] = valor;
        }
      } else {
        paqueteData[clave] = null;
      }
    }

    const prefijo = esClonacion ? "ABESTORE_CLON_P2P" : "ABESTORE_BACKUP_TOTAL";
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:.]/g, "")
      .slice(0, 15);
    const nombreArchivo = `${prefijo}_${timestamp}.json`;

    const rutaTemporal = `${FileSystem.documentDirectory}${nombreArchivo}`;

    await FileSystem.writeAsStringAsync(
      rutaTemporal,
      JSON.stringify(paqueteData),
      {
        encoding: "utf8",
      },
    );

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(rutaTemporal, {
        mimeType: "application/json",
        dialogTitle: esClonacion
          ? "Traspasar Base de Datos"
          : "Exportar Copia de Seguridad",
        UTI: "public.json",
      });
    } else {
      Alert.alert(
        "Error",
        "La función de compartir no está disponible en este terminal.",
      );
    }
  } catch (error) {
    console.error("Error al exportar datos:", error);
    Alert.alert(
      "Error Crítico",
      "No se pudieron empaquetar los datos locales.",
    );
  }
};

/**
 * IMPORTAR DATOS DESDE UN ARCHIVO EXTERNO
 */
export const importarDatosSistema = async (
  jsonString: string,
  esClonacion: boolean = false,
) => {
  try {
    const datosImportados = JSON.parse(jsonString);

    const idDispositivoActual = await AsyncStorage.getItem(
      "id_dispositivo_local",
    );
    const rolRedActual = await AsyncStorage.getItem(
      "rol_sincronizacion_dispositivo",
    );
    const hardwareCapturaActual = await AsyncStorage.getItem(
      "dispositivo_escaneo",
    );

    if (esClonacion) {
      await AsyncStorage.clear();
    }

    for (const clave of CLAVES_SISTEMA) {
      if (
        datosImportados[clave] !== undefined &&
        datosImportados[clave] !== null
      ) {
        const valorAIdear =
          typeof datosImportados[clave] === "object"
            ? JSON.stringify(datosImportados[clave])
            : datosImportados[clave];
        await AsyncStorage.setItem(clave, valorAIdear);
      }
    }

    if (idDispositivoActual)
      await AsyncStorage.setItem("id_dispositivo_local", idDispositivoActual);
    if (rolRedActual)
      await AsyncStorage.setItem(
        "rol_sincronizacion_dispositivo",
        rolRedActual,
      );
    if (hardwareCapturaActual)
      await AsyncStorage.setItem("dispositivo_escaneo", hardwareCapturaActual);

    Alert.alert(
      "Éxito en la Carga",
      esClonacion
        ? "Base de datos clonada. Se ha conservado la identidad de este dispositivo."
        : "Copia de seguridad restaurada correctamente.",
    );

    return true;
  } catch (error) {
    console.error("Error al importar datos:", error);
    Alert.alert(
      "Fallo de Verificación",
      "El archivo seleccionado no es un respaldo válido.",
    );
    return false;
  }
};
