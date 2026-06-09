import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

// --- INTERFACES SINCRONIZADAS CON STOCK.TSX (SISTEMA P2P) ---
interface BultoStock {
  idBulto: string;
  numeroPedido: string;
  cip: string;
  propietario: string;
  ucoAsignada: string;
  updatedAt: string;
  borrado?: boolean; // 🌟 Clave para el control de bajas distribuidas
}

interface FilaAlbaran {
  idUco: string;
  nombreUco: string;
  bultosTeoricos: number;
  albaran: string;
}

interface RecepcionCerrada {
  idRecepcion: string;
  fechaFinalizacion: string;
  operario: string;
  updatedAt: string;
  ucosAfectadas: { [idUco: string]: FilaAlbaran };
  detalleBultos: BultoStock[];
}

export default function ScanBarcodeScreen() {
  const router = useRouter();

  // Estados de configuración de hardware
  const [tipoHardware, setTipoHardware] = useState<string | null>(null);
  const [codigoLeido, setCodigoLeido] = useState<string | null>(null);

  // Estados de flujo de negocio (Enlazados con la estructura del Histórico)
  const [cargandoPaquete, setCargandoPaquete] = useState<boolean>(false);
  const [bultoEncontrado, setBultoEncontrado] = useState<BultoStock | null>(
    null,
  );
  const [nombreUcoDestino, setNombreUcoDestino] =
    useState<string>("Cargando...");

  // Permisos y autofocus para Smartphone
  const [permission, requestPermission] = useCameraPermissions();
  const [autofocus, setAutofocus] = useState(true);

  // Referencia para capturar el haz láser de la PDA Datalogic Skorpio X5
  const inputLaserRef = useRef<TextInput>(null);

  // 1. Sincronizar el tipo de hardware configurado en el sistema
  useFocusEffect(
    useCallback(() => {
      const cargarHardware = async () => {
        try {
          const hardwareGuardado = await AsyncStorage.getItem(
            "dispositivo_escaneo",
          );
          setTipoHardware(hardwareGuardado || "android_camara");
          reiniciarEscaneo();
        } catch (error) {
          setTipoHardware("android_camara");
        }
      };
      cargarHardware();
    }, []),
  );

  // 2. Mantener el enfoque del receptor láser de la PDA en segundo plano
  useEffect(() => {
    if (tipoHardware === "skorpio_laser" && !codigoLeido) {
      const checkFocus = setInterval(() => {
        inputLaserRef.current?.focus();
      }, 300);
      return () => clearInterval(checkFocus);
    }
  }, [tipoHardware, codigoLeido]);

  // 3. BÚSQUEDA REAL EN EL HISTÓRICO DE RECEPCIONES (MODIFICADO P2P)
  const procesarCodigoCapturado = async (codigo: string) => {
    const codigoLimpio = codigo.trim().toUpperCase();
    setCodigoLeido(codigoLimpio);
    setCargandoPaquete(true);

    try {
      const historicoRaw = await AsyncStorage.getItem("historico_recepciones");
      const historico: RecepcionCerrada[] = historicoRaw
        ? JSON.parse(historicoRaw)
        : [];

      // Extraemos todos los bultos activos (Omitiendo los que ya están borrados lógicamente)
      let todosLosBultos: BultoStock[] = [];
      historico.forEach((rec) => {
        if (rec.detalleBultos) {
          rec.detalleBultos.forEach((b) => {
            if (!b.borrado) {
              // 🌟 FILTRO CRÍTICO: Si está borrado lógicamente, se ignora
              todosLosBultos.push(b);
            }
          });
        }
      });

      // Buscamos coincidencia tanto por Número de Pedido como por ID Único de bulto
      const bulto = todosLosBultos.find(
        (b) =>
          b.numeroPedido.trim().toUpperCase() === codigoLimpio ||
          b.idBulto.trim().toUpperCase() === codigoLimpio,
      );

      if (bulto) {
        setBultoEncontrado(bulto);

        // Resolvemos el nombre amigable de la UCO usando el maestro "lista_ucos"
        const ucosRaw = await AsyncStorage.getItem("lista_ucos");
        if (ucosRaw) {
          const ucosDisponibles = JSON.parse(ucosRaw);
          const ucoMatch = ucosDisponibles.find(
            (u: any) => u.id === bulto.ucoAsignada,
          );
          setNombreUcoDestino(ucoMatch ? ucoMatch.nombre : bulto.ucoAsignada);
        } else {
          setNombreUcoDestino(bulto.ucoAsignada);
        }
      } else {
        setBultoEncontrado(null);
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "No se pudo consultar el almacenamiento central.");
    } finally {
      setCargandoPaquete(false);
    }
  };

  // Acciones de captura hardware
  const alEscanearConCamara = ({ data }: { data: string }) => {
    if (codigoLeido) return;
    procesarCodigoCapturado(data);
  };

  const alEscanearConLaser = (texto: string) => {
    if (texto.endsWith("\n") || texto.trim().length > 0) {
      procesarCodigoCapturado(texto);
    }
  };

  // 4. ACCIÓN DE BAJA POR ENTREGA (COMPLETAMENTE REESCRITO PARA P2P)
  const ejecutarBajaMaterial = async () => {
    if (!bultoEncontrado) return;

    Alert.alert(
      "Confirmar Entrega Directa",
      `¿Deseas tramitar la baja definitiva del Pedido [${bultoEncontrado.numeroPedido}] del Stock operativo?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, Entregar",
          style: "destructive",
          onPress: async () => {
            try {
              const historicoRaw = await AsyncStorage.getItem(
                "historico_recepciones",
              );
              const historico: RecepcionCerrada[] = historicoRaw
                ? JSON.parse(historicoRaw)
                : [];

              // Buscamos el bulto en el histórico para marcarlo como borrado lógico con un timestamp nuevo
              const nuevoHistorico = historico.map((rec) => {
                let contieneBulto = false;

                const bultosModificados = rec.detalleBultos.map((b) => {
                  if (b.idBulto === bultoEncontrado.idBulto) {
                    contieneBulto = true;
                    return {
                      ...b,
                      borrado: true, // 🌟 Borrado lógico
                      updatedAt: new Date().toISOString(), // 🌟 Timestamp fresco para que pise en la sincronización
                    };
                  }
                  return b;
                });

                if (contieneBulto) {
                  return {
                    ...rec,
                    updatedAt: new Date().toISOString(), // Actualizamos el timestamp de la recepción padre
                    detalleBultos: bultosModificados,
                  };
                }
                return rec;
              });

              // Guardamos la nueva estructura con la baja lógica en AsyncStorage
              await AsyncStorage.setItem(
                "historico_recepciones",
                JSON.stringify(nuevoHistorico),
              );

              Alert.alert(
                "Éxito",
                "Salida y baja de material procesada correctamente.",
              );
              reiniciarEscaneo();
            } catch (e) {
              Alert.alert(
                "Error",
                "No se pudo realizar la baja en la base de datos.",
              );
            }
          },
        },
      ],
    );
  };

  const forzarAutofocusAlTocar = () => {
    if (!autofocus) return;
    setAutofocus(false);
    setTimeout(() => setAutofocus(true), 100);
  };

  const reiniciarEscaneo = () => {
    setCodigoLeido(null);
    setBultoEncontrado(null);
    setNombreUcoDestino("Cargando...");
  };

  if (tipoHardware === null) {
    return (
      <View style={styles.contenedorCentrado}>
        <ActivityIndicator size="large" color="#79715B" />
        <Text style={styles.textoEspera}>
          Sincronizando con base de datos...
        </Text>
      </View>
    );
  }

  // --- RENDERING: VISTA DE RESULTADOS DE ESCANEO ---
  if (codigoLeido) {
    return (
      <View style={styles.contenedorResultado}>
        <View style={styles.tarjetaResultado}>
          {cargandoPaquete ? (
            <View style={{ padding: 20, alignItems: "center" }}>
              <ActivityIndicator size="large" color="#79715B" />
              <Text style={{ marginTop: 10, color: "#7f8c8d" }}>
                Localizando registro de bulto...
              </Text>
            </View>
          ) : bultoEncontrado ? (
            <>
              <Text style={styles.iconoExito}>📦</Text>
              <Text style={styles.tituloResultado}>
                Pedido: {bultoEncontrado.numeroPedido}
              </Text>

              <Text style={styles.textoDetalles}>
                CIP:{" "}
                <Text style={styles.textoResaltado}>{bultoEncontrado.cip}</Text>
              </Text>

              <Text style={styles.textoDetalles}>
                Destino UCO:{" "}
                <Text style={styles.textoResaltado}>{nombreUcoDestino}</Text>
              </Text>

              <Text style={styles.textoPropietario}>
                Asignado a: {bultoEncontrado.propietario}
              </Text>

              <View style={[styles.etiquetaStock, styles.etiquetaEnStock]}>
                <Text style={styles.textoEtiquetaStock}>
                  🟢 DISPONIBLE EN ALMACÉN
                </Text>
              </View>

              <View style={styles.separador} />

              {/* ACCIÓN DIRECTA DE BAJA */}
              <TouchableOpacity
                style={styles.botonEntregar}
                onPress={ejecutarBajaMaterial}
              >
                <Text style={styles.textoBoton}>
                  📦 ENTREGAR MATERIAL (BAJA)
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.iconoExito}>⚠️</Text>
              <Text style={styles.tituloResultado}>Bulto no Registrado</Text>
              <Text style={styles.subtituloPaquete}>
                No figura en el stock activo de ninguna recepción.
              </Text>
              <View style={styles.bloqueCodigo}>
                <Text style={styles.textoCodigo}>{codigoLeido}</Text>
              </View>
            </>
          )}

          <View style={styles.separador} />

          <TouchableOpacity
            style={styles.botonNuevoEscaneo}
            onPress={reiniciarEscaneo}
          >
            <Text style={styles.textoBoton}>Nuevo Escaneo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.botonSalir}
            onPress={() => router.replace("/menu")}
          >
            <Text style={styles.textoBotonSalir}>Volver al Menú</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // --- MODO: SMARTPHONE ANDROID CÁMARA ---
  if (tipoHardware === "android_camara") {
    if (!permission) return <View style={styles.contenedorCentrado} />;
    if (!permission.granted) {
      return (
        <View style={styles.contenedorCentrado}>
          <Text style={styles.textoPermiso}>
            Se necesita acceso a la cámara para el escaneo de pedidos.
          </Text>
          <TouchableOpacity
            style={styles.botonPermiso}
            onPress={requestPermission}
          >
            <Text style={styles.textoBoton}>Conceder Permiso</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.contenedor}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ["qr", "ean13", "code128", "code39"],
          }}
          onBarcodeScanned={alEscanearConCamara}
          autofocus={autofocus ? "on" : "off"}
        />
        <TouchableOpacity
          activeOpacity={1}
          style={styles.capaInterfazAbsoluta}
          onPress={forzarAutofocusAlTocar}
        >
          <View style={styles.capaOscuraSuperior} />
          <View style={styles.filaCentralEncuadre}>
            <View style={styles.capaOscuraLateral} />
            <View style={styles.cuadroGuia}>
              <View style={styles.lineaEscaneoRoja} />
            </View>
            <View style={styles.capaOscuraLateral} />
          </View>
          <View style={styles.capaOscuraInferior}>
            <Text style={styles.textoInstruccionCamara}>
              Alinea el código de barras del pedido
            </Text>
            <TouchableOpacity
              style={styles.botonCancelarFlotante}
              onPress={() => router.replace("/menu")}
            >
              <Text style={styles.textoBotonSalir}>❌ Salir al Menú</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  // --- MODO: LÁSER INDUSTRIAL PDA DATALOGIC SKORPIO X5 ---
  return (
    <View style={styles.contenedorLaser}>
      <TextInput
        ref={inputLaserRef}
        style={styles.inputOcultoLaser}
        showSoftInputOnFocus={false}
        autoFocus={true}
        value=""
        onChangeText={alEscanearConLaser}
      />
      <View style={styles.tarjetaLaserEspera}>
        <Text style={styles.iconoLaserAnimado}>📟</Text>
        <Text style={styles.tituloLaser}>Gatillo Láser Conectado</Text>
        <Text style={styles.subtituloLaser}>
          Esperando lectura de bulto o albarán...
        </Text>
        <View style={styles.franjaIndicadora}>
          <Text style={styles.textoInstruccionLaser}>
            Dispare directamente sobre la etiqueta del bulto
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.botonSalir, { marginTop: 35 }]}
          onPress={() => router.replace("/menu")}
        >
          <Text style={styles.textoBotonSalir}>Volver al Menú</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: "#000" },
  contenedorCentrado: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f6fa",
  },
  textoEspera: { marginTop: 10, fontSize: 14, color: "#7f8c8d" },
  textoPermiso: {
    fontSize: 15,
    textAlign: "center",
    color: "#2c3e50",
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  botonPermiso: {
    backgroundColor: "#79715B",
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  capaInterfazAbsoluta: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  capaOscuraSuperior: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  filaCentralEncuadre: { flexDirection: "row", height: 180 },
  capaOscuraLateral: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  cuadroGuia: {
    width: 280,
    height: 180,
    borderWidth: 2,
    borderColor: "#2ecc71",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 6,
  },
  lineaEscaneoRoja: { width: "95%", height: 2, backgroundColor: "#e74c3c" },
  capaOscuraInferior: {
    flex: 2,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    paddingTop: 20,
  },
  textoInstruccionCamara: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 30,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingVertical: 6,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  botonCancelarFlotante: {
    backgroundColor: "#c0392b",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
  },
  contenedorLaser: {
    flex: 1,
    backgroundColor: "#2c3e50",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  inputOcultoLaser: { position: "absolute", width: 0, height: 0, opacity: 0 },
  tarjetaLaserEspera: {
    backgroundColor: "#fff",
    width: "100%",
    maxWidth: 330,
    borderRadius: 16,
    padding: 25,
    alignItems: "center",
    elevation: 5,
  },
  iconoLaserAnimado: { fontSize: 45, marginBottom: 10 },
  tituloLaser: { fontSize: 19, fontWeight: "bold", color: "#2c3e50" },
  subtituloLaser: {
    fontSize: 13,
    color: "#7f8c8d",
    marginTop: 4,
    marginBottom: 20,
  },
  franjaIndicadora: {
    backgroundColor: "#e67e22",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 6,
    width: "100%",
  },
  textoInstruccionLaser: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
  },
  contenedorResultado: {
    flex: 1,
    backgroundColor: "#f5f6fa",
    justifyContent: "center",
    alignItems: "center",
    padding: 15,
  },
  tarjetaResultado: {
    backgroundColor: "#fff",
    width: "100%",
    maxWidth: 350,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    elevation: 4,
  },
  iconoExito: { fontSize: 40, marginBottom: 5 },
  tituloResultado: { fontSize: 21, fontWeight: "bold", color: "#2c3e50" },
  textoDetalles: { fontSize: 14, color: "#505a5b", marginTop: 4 },
  textoResaltado: { fontWeight: "bold", color: "#2c3e50" },
  textoPropietario: {
    fontSize: 14,
    color: "#27ae60",
    fontWeight: "bold",
    marginTop: 6,
    marginBottom: 12,
  },
  subtituloPaquete: {
    fontSize: 13,
    color: "#7f8c8d",
    textAlign: "center",
    marginBottom: 10,
  },
  etiquetaStock: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  etiquetaEnStock: { backgroundColor: "#2ecc71" },
  textoEtiquetaStock: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  separador: {
    width: "100%",
    height: 1,
    backgroundColor: "#f1f2f6",
    marginVertical: 15,
  },
  botonEntregar: {
    backgroundColor: "#e67e22",
    paddingVertical: 14,
    width: "100%",
    borderRadius: 8,
    alignItems: "center",
  },
  bloqueCodigo: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#dcdde1",
    paddingVertical: 10,
    borderRadius: 8,
    width: "100%",
    alignItems: "center",
  },
  textoCodigo: { fontSize: 17, fontWeight: "bold", color: "#7f8c8d" },
  botonNuevoEscaneo: {
    backgroundColor: "#2c3e50",
    paddingVertical: 12,
    width: "100%",
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  botonSalir: {
    backgroundColor: "#bdc3c7",
    paddingVertical: 12,
    width: "100%",
    borderRadius: 8,
    alignItems: "center",
  },
  textoBoton: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  textoBotonSalir: { color: "#fff", fontSize: 14, fontWeight: "bold" },
});
