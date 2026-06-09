import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function MenuPrincipalScreen() {
  const router = useRouter();

  // Estados de la sesión y el entorno
  const [operario, setOperario] = useState("Cargando...");
  const [fechaHora, setFechaHora] = useState("");
  const [sedeUco, setSedeUco] = useState("");
  const [estaConfigurado, setEstaConfigurado] = useState(false);

  // 1. Reloj en tiempo real
  useEffect(() => {
    const actualizarReloj = () => {
      const ahora = new Date();
      const opciones: Intl.DateTimeFormatOptions = {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      };
      setFechaHora(ahora.toLocaleString("es-ES", opciones).replace(",", " -"));
    };

    actualizarReloj();
    const intervalo = setInterval(actualizarReloj, 1000);
    return () => clearInterval(intervalo);
  }, []);

  // 2. Cargar los datos del operario logueado
  const obtenerUsuarioSesion = async () => {
    try {
      const sesionActiva = await AsyncStorage.getItem("usuario_activo");
      if (sesionActiva !== null) {
        setOperario(sesionActiva);
      } else {
        setOperario("Desconocido");
      }
    } catch (error) {
      setOperario("Error al cargar");
    }
  };

  // 3. Comprobar la configuración general del almacén
  const comprobarConfiguracionMenu = async () => {
    try {
      const ucoGuardadaRaw = await AsyncStorage.getItem("uco_receptora");
      const configGuardada = await AsyncStorage.getItem(
        "configuracion_almacen",
      );
      const listaGuardadaRaw = await AsyncStorage.getItem("lista_ucos");

      let tieneUcoSede = false;
      let tieneUcosDestinoActivas = false;

      if (ucoGuardadaRaw !== null) {
        try {
          const objetoUco = JSON.parse(ucoGuardadaRaw);
          if (objetoUco && objetoUco.nombre) {
            setSedeUco(objetoUco.nombre);
            tieneUcoSede = true;
          }
        } catch (e) {
          setSedeUco(ucoGuardadaRaw);
          tieneUcoSede = true;
        }
      } else {
        setSedeUco("");
      }

      if (listaGuardadaRaw !== null) {
        const listaParsed = JSON.parse(listaGuardadaRaw);
        const activas = listaParsed.filter((u: any) => !u.borrado);
        if (activas.length > 0) {
          tieneUcosDestinoActivas = true;
        }
      }

      if (
        configGuardada === "CONFIGURADO_OK" &&
        tieneUcoSede &&
        tieneUcosDestinoActivas
      ) {
        setEstaConfigurado(true);
      } else {
        setEstaConfigurado(false);
      }
    } catch (error) {
      console.log("Error al verificar configuración en menú", error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      obtenerUsuarioSesion();
      comprobarConfiguracionMenu();
    }, []),
  );

  // 🌟 Mánager de navegación seguro adaptado con /hisdevrec incluido
  const navegarModulo = async (ruta: string, nombreModulo: string) => {
    try {
      const configGuardada = await AsyncStorage.getItem(
        "configuracion_almacen",
      );
      const ucoGuardadaRaw = await AsyncStorage.getItem("uco_receptora");
      const listaGuardadaRaw = await AsyncStorage.getItem("lista_ucos");

      let tieneUcosDestinoActivas = false;

      if (listaGuardadaRaw !== null) {
        const listaParsed = JSON.parse(listaGuardadaRaw);
        const ucosActivas = listaParsed.filter((u: any) => !u.borrado);
        if (ucosActivas.length > 0) {
          tieneUcosDestinoActivas = true;
        }
      }

      if (
        configGuardada !== "CONFIGURADO_OK" ||
        !ucoGuardadaRaw ||
        !tieneUcosDestinoActivas
      ) {
        let mensajeAlerta =
          "Es necesario configurar el dispositivo antes de operar. ";

        if (!tieneUcosDestinoActivas && configGuardada === "CONFIGURADO_OK") {
          mensajeAlerta =
            "No se pueden realizar operaciones porque no queda ninguna UCO de distribución activa en el sistema. ";
        }

        Alert.alert(
          "Configuración Incompleta",
          `${mensajeAlerta}Vaya al apartado de configuración para completar los datos de almacén.`,
          [
            {
              text: "Ir a Configuración",
              onPress: () => router.push("/config"),
            },
            { text: "Cancelar", style: "cancel" },
          ],
        );
        return;
      }

      // Mapeo explícito de resoluciones de rutas de Expo Router
      if (ruta === "/stock") {
        router.push("/stock");
      } else if (ruta === "/recepcion") {
        router.push("/recepcion");
      } else if (ruta === "/devoluciones") {
        router.push("/devoluciones");
      } else if (ruta === "/hisdevrec") {
        router.push("/hisdevrec"); // 🌟 Enrutado del historial global
      } else {
        router.push(ruta as any);
      }
    } catch (error) {
      Alert.alert(
        "Error",
        "No se pudo verificar el estado de los archivos de almacén.",
      );
    }
  };

  return (
    <View style={styles.contenedor}>
      {/* FRANJA SUPERIOR CAQUI */}
      <View style={styles.franjaCaqui}>
        <View style={styles.datosSesion}>
          <Text style={styles.textoBienvenido}>
            Servicio de almacén{sedeUco ? ` - ${sedeUco}` : ""}
          </Text>
          <Text style={styles.textoReloj}>
            Operario: {operario} | {fechaHora}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.botonSalir}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.textoBotonSalir}>Salir</Text>
        </TouchableOpacity>
      </View>

      {/* REJILLA DE MENÚS */}
      <View style={styles.contenedorMosaico}>
        {/* Fila 1 */}
        <View style={styles.fila}>
          <TouchableOpacity
            style={styles.tarjetaBoton}
            onPress={() => router.push("/scan")}
          >
            <Text style={styles.iconoBoton}>🔍</Text>
            <Text style={styles.textoBoton}>Scan Barcode</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tarjetaBoton,
              !estaConfigurado && styles.tarjetaDesactivada,
            ]}
            onPress={() => navegarModulo("/recepcion", "Crear Recepción")}
          >
            <Text style={styles.iconoBoton}>📥</Text>
            <Text
              style={[
                styles.textoBoton,
                !estaConfigurado && styles.textoDesactivada,
              ]}
            >
              Crear Recepción
            </Text>
          </TouchableOpacity>
        </View>

        {/* Fila 2 */}
        <View style={styles.fila}>
          <TouchableOpacity
            style={[
              styles.tarjetaBoton,
              !estaConfigurado && styles.tarjetaDesactivada,
            ]}
            onPress={() => navegarModulo("/devoluciones", "Crear Devolución")}
          >
            <Text style={styles.iconoBoton}>🔄</Text>
            <Text
              style={[
                styles.textoBoton,
                !estaConfigurado && styles.textoDesactivada,
              ]}
            >
              Crear Devolución
            </Text>
          </TouchableOpacity>

          {/* 🌟 Historial unificado ahora completamente operativo */}
          <TouchableOpacity
            style={[
              styles.tarjetaBoton,
              !estaConfigurado && styles.tarjetaDesactivada,
            ]}
            onPress={() => navegarModulo("/hisdevrec", "Histórico Rec/Dev")}
          >
            <Text style={styles.iconoBoton}>📋</Text>
            <Text
              style={[
                styles.textoBoton,
                !estaConfigurado && styles.textoDesactivada,
              ]}
            >
              Histórico Rec/Dev
            </Text>
          </TouchableOpacity>
        </View>

        {/* Fila 3 */}
        <View style={styles.fila}>
          <TouchableOpacity
            style={[
              styles.tarjetaBoton,
              !estaConfigurado && styles.tarjetaDesactivada,
            ]}
            onPress={() => navegarModulo("/stock", "Stock")}
          >
            <Text style={styles.iconoBoton}>📦</Text>
            <Text
              style={[
                styles.textoBoton,
                !estaConfigurado && styles.textoDesactivada,
              ]}
            >
              Stock
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tarjetaBoton, styles.tarjetaAjustes]}
            onPress={() => router.push("/config")}
          >
            <Text style={styles.iconoBoton}>⚙️</Text>
            <Text style={styles.textoBoton}>Configuración</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: "#f5f6fa" },
  franjaCaqui: {
    backgroundColor: "#79715B",
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 2,
    borderColor: "#5c5645",
  },
  datosSesion: { flex: 1, paddingRight: 10 },
  textoBienvenido: { fontSize: 18, fontWeight: "bold", color: "#ffffff" },
  textoReloj: {
    fontSize: 12,
    color: "#e0dbcd",
    marginTop: 3,
    fontWeight: "500",
  },
  botonSalir: {
    backgroundColor: "#c0392b",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#a93226",
  },
  textoBotonSalir: { color: "#ffffff", fontWeight: "bold", fontSize: 13 },
  contenedorMosaico: {
    flex: 1,
    padding: 15,
    justifyContent: "center",
    gap: 15,
  },
  fila: { flex: 1, flexDirection: "row", gap: 15 },
  tarjetaBoton: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#dcdde1",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tarjetaAjustes: { backgroundColor: "#fcfcfc", borderColor: "#bdc3c7" },
  tarjetaDesactivada: {
    backgroundColor: "#eceff1",
    borderColor: "#cfd8dc",
    opacity: 0.6,
  },
  iconoBoton: { fontSize: 40, marginBottom: 10 },
  textoBoton: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#2c3e50",
    textAlign: "center",
  },
  textoDesactivada: { color: "#90a4ae" },
});
