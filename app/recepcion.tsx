import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

// --- INTERFACES DE LA JERARQUÍA DE DATOS ---
interface BultoEscaneado {
  idBulto: string;
  numeroPedido: string;
  cip: string;
  propietario: string;
  ucoAsignada: string;
  // 🌟 Campos Clave P2P agregados para sincronización robusta
  updatedAt: string;
  borrado: boolean;
}

interface FilaAlbaran {
  idUco: string;
  nombreUco: string;
  bultosTeoricos: number;
  albaran: string;
}

interface RecepcionEstructurada {
  idRecepcion: string;
  fechaInicio: string;
  operario: string;
  fase: 1 | 2;
  periodoRecepcion: string;
  filasAlbaran: { [idUco: string]: FilaAlbaran };
  bultosEscaneados: BultoEscaneado[];
}

export default function CrearRecepcionScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  // Estados de control de flujo e identidad
  const [fase, setFase] = useState<1 | 2>(1);
  const [operarioActual, setOperarioActual] = useState("");
  const [idRecepcion, setIdRecepcion] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");

  // Control de fecha retroactiva
  const [mesRecepcion, setMesRecepcion] = useState("");
  const [anioRecepcion, setAnioRecepcion] = useState("");
  const [periodoAsignadoFinal, setPeriodoAsignadoFinal] = useState("");

  // Configuración de Hardware de AbeStoreSv detectado
  const [tipoHardware, setTipoHardware] = useState<string>("android_camara");

  // Estados de datos cargados del Gestor de Almacén
  const [listaUcosDisponibles, setListaUcosDisponibles] = useState<any[]>([]);
  const [inputsAlbaran, setInputsAlbaran] = useState<{
    [idUco: string]: { bultos: string; albaran: string };
  }>({});
  const [bultosEscaneados, setBultosEscaneados] = useState<BultoEscaneado[]>(
    [],
  );

  // Estados de la Ventana Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [modalUcoSeleccionada, setModalUcoSeleccionada] = useState("");
  const [modalNumeroPedido, setModalNumeroPedido] = useState("");
  const [modalCip, setModalCip] = useState("");
  const [modalPropietario, setModalPropietario] = useState("");

  // Estado para visor de cámara (Modo Android Cámara)
  const [mostrandoCamara, setMostrandoCamara] = useState(false);

  // Referencia para el haz láser de la PDA Skorpio
  const inputModalLaserRef = useRef<TextInput>(null);

  useEffect(() => {
    inicializarPantalla();
  }, []);

  // Controlar el re-enfoque automático del láser físico únicamente cuando la modal esté abierta y en modo Skorpio
  useEffect(() => {
    let intervaloEnfoque: NodeJS.Timeout;
    if (modalVisible && tipoHardware === "skorpio_laser" && !mostrandoCamara) {
      intervaloEnfoque = setInterval(() => {
        inputModalLaserRef.current?.focus();
      }, 300);
    }
    return () => {
      if (intervaloEnfoque) clearInterval(intervaloEnfoque);
    };
  }, [modalVisible, tipoHardware, mostrandoCamara]);

  // --- LÓGICA DE PERSISTENCIA Y CARGA ---
  const inicializarPantalla = async () => {
    try {
      const hardwareGuardado = await AsyncStorage.getItem(
        "dispositivo_escaneo",
      );
      setTipoHardware(hardwareGuardado || "android_camara");

      const operario = await AsyncStorage.getItem("usuario_activo");
      setOperarioActual(operario || "Desconocido");

      const ucosRaw = await AsyncStorage.getItem("lista_ucos");
      let ucosActivas: any[] = [];
      if (ucosRaw !== null) {
        ucosActivas = JSON.parse(ucosRaw).filter((u: any) => !u.borrado);
        setListaUcosDisponibles(ucosActivas);
      }

      // Obtener mes y año actual como fallback por defecto
      const mesesAnio = [
        "Enero",
        "Febrero",
        "Marzo",
        "Abril",
        "Mayo",
        "Junio",
        "Julio",
        "Agosto",
        "Septiembre",
        "Octubre",
        "Noviembre",
        "Diciembre",
      ];
      const fechaActual = new Date();
      const mesPorDefecto = mesesAnio[fechaActual.getMonth()];
      const anioPorDefecto = fechaActual.getFullYear().toString();

      const pausaRaw = await AsyncStorage.getItem("recepcion_en_progreso");
      if (pausaRaw !== null) {
        const pausa: RecepcionEstructurada = JSON.parse(pausaRaw);
        setIdRecepcion(pausa.idRecepcion);
        setFechaInicio(pausa.fechaInicio);

        // Soportar compatibilidad si se recuperan datos antiguos sin la bandera borrado
        const bultosNormalizados = (pausa.bultosEscaneados || []).map(
          (b: any) => ({
            ...b,
            updatedAt: b.updatedAt || new Date().toISOString(),
            borrado: b.borrado || false,
          }),
        );
        setBultosEscaneados(bultosNormalizados);

        setFase(pausa.fase);
        setPeriodoAsignadoFinal(
          pausa.periodoRecepcion || `${mesPorDefecto} de ${anioPorDefecto}`,
        );

        if (pausa.periodoRecepcion) {
          const partes = pausa.periodoRecepcion.split(" de ");
          setMesRecepcion(partes[0] || mesPorDefecto);
          setAnioRecepcion(
            partes[1] ? partes[1].split(" ")[0] : anioPorDefecto,
          );
        }

        const inputsReconstruidos: {
          [idUco: string]: { bultos: string; albaran: string };
        } = {};
        ucosActivas.forEach((u) => {
          const fila = pausa.filasAlbaran[u.id];
          inputsReconstruidos[u.id] = {
            bultos: fila ? fila.bultosTeoricos.toString() : "",
            albaran: fila ? fila.albaran : "",
          };
        });
        setInputsAlbaran(inputsReconstruidos);
        Alert.alert(
          "Recepción Recuperada",
          "Se ha restaurado la sesión de trabajo pausada.",
        );
      } else {
        setIdRecepcion(
          `REC_${new Date().toISOString().replace(/[-:T.Z]/g, "")}`,
        );
        setFechaInicio(new Date().toISOString());
        setMesRecepcion(mesPorDefecto);
        setAnioRecepcion(anioPorDefecto);

        const inputsIniciales: {
          [idUco: string]: { bultos: string; albaran: string };
        } = {};
        ucosActivas.forEach((u) => {
          inputsIniciales[u.id] = { bultos: "", albaran: "" };
        });
        setInputsAlbaran(inputsIniciales);
      }
    } catch (e) {
      Alert.alert("Error", "Error al inicializar la sesión de recepción.");
    }
  };

  const calcularSufijoPeriodoUnico = async (
    mes: string,
    anio: string,
  ): Promise<string> => {
    const etiquetaBase = `${mes.trim()} de ${anio.trim()}`;
    try {
      const historicoRaw = await AsyncStorage.getItem("historico_recepciones");
      if (!historicoRaw) return etiquetaBase;

      const historico = JSON.parse(historicoRaw);
      const coincidencias = historico.filter(
        (rec: any) =>
          rec.periodoRecepcion === etiquetaBase ||
          (rec.periodoRecepcion &&
            rec.periodoRecepcion.startsWith(`${etiquetaBase} `)),
      );

      if (coincidencias.length === 0) {
        return etiquetaBase;
      } else {
        return `${etiquetaBase} ${coincidencias.length + 1}`;
      }
    } catch {
      return etiquetaBase;
    }
  };

  const guardarPrevalidoEnCaliente = async (
    faseDestino: 1 | 2,
    periodoCalculado?: string,
  ) => {
    const filasAlbaran: { [idUco: string]: FilaAlbaran } = {};
    listaUcosDisponibles.forEach((uco) => {
      const datos = inputsAlbaran[uco.id];
      const numBultos = parseInt(datos?.bultos || "0");
      if (numBultos > 0) {
        filasAlbaran[uco.id] = {
          idUco: uco.id,
          nombreUco: uco.nombre,
          bultosTeoricos: numBultos,
          albaran: datos.albaran.trim().toUpperCase(),
        };
      }
    });

    const sesionGesta: RecepcionEstructurada = {
      idRecepcion,
      fechaInicio,
      operario: operarioActual,
      fase: faseDestino,
      periodoRecepcion:
        periodoCalculado ||
        periodoAsignadoFinal ||
        `${mesRecepcion} de ${anioRecepcion}`,
      filasAlbaran,
      bultosEscaneados,
    };
    await AsyncStorage.setItem(
      "recepcion_en_progreso",
      JSON.stringify(sesionGesta),
    );
  };

  const avanzarAFase2 = async () => {
    if (!mesRecepcion.trim() || !anioRecepcion.trim()) {
      Alert.alert(
        "Campos Obligatorios",
        "Por favor introduce el mes y año para la asignación retroactiva.",
      );
      return;
    }

    let totalBultosDeclarados = 0;
    let errorAlbaranVacio = false;

    listaUcosDisponibles.forEach((uco) => {
      const bultosStr = inputsAlbaran[uco.id]?.bultos || "";
      const albaranStr = inputsAlbaran[uco.id]?.albaran || "";
      const bultosNum = parseInt(bultosStr) || 0;

      if (bultosNum > 0) {
        totalBultosDeclarados += bultosNum;
        if (albaranStr.trim() === "") errorAlbaranVacio = true;
      }
    });

    if (totalBultosDeclarados === 0) {
      Alert.alert(
        "Falta Información",
        "Debes declarar al menos 1 bulto en alguna UCO.",
      );
      return;
    }
    if (errorAlbaranVacio) {
      Alert.alert(
        "Campo Obligatorio",
        "Toda UCO con bultos requiere número de albarán.",
      );
      return;
    }

    const periodoFinal = await calcularSufijoPeriodoUnico(
      mesRecepcion,
      anioRecepcion,
    );
    setPeriodoAsignadoFinal(periodoFinal);

    setFase(2);
    await guardarPrevalidoEnCaliente(2, periodoFinal);
  };

  const presionarBotonEscaner = async () => {
    if (tipoHardware === "skorpio_laser") {
      inputModalLaserRef.current?.focus();
    } else {
      if (!permission?.granted) {
        const respuestaPermiso = await requestPermission();
        if (!respuestaPermiso.granted) {
          Alert.alert(
            "Permiso Denegado",
            "Se necesita acceso a la cámara para escanear bultos.",
          );
          return;
        }
      }
      setMostrandoCamara(true);
    }
  };

  const alEscanearConCamara = ({ data }: { data: string }) => {
    setMostrandoCamara(false);
    setModalNumeroPedido(data.trim());
  };

  const alEscanearConLaserSkorpio = (texto: string) => {
    if (texto.trim().length > 0) {
      setModalNumeroPedido(texto.trim());
    }
  };

  const guardarBultoUnitario = async () => {
    if (!modalUcoSeleccionada) {
      Alert.alert("Campo Obligatorio", "Debes seleccionar la UCO de destino.");
      return;
    }
    if (modalNumeroPedido.trim() === "") {
      Alert.alert("Campo Obligatorio", "El número de pedido es obligatorio.");
      return;
    }
    if (modalCip.trim() === "") {
      Alert.alert("Campo Obligatorio", "El código CIP es obligatorio.");
      return;
    }

    const codigoLimpio = modalNumeroPedido.trim().toUpperCase();

    // 1. VALIDACIÓN EN CALIENTE: Comprobar activos en la sesión actual
    const yaExisteEnMuelle = bultosEscaneados.some(
      (b) => b.numeroPedido === codigoLimpio && !b.borrado,
    );
    if (yaExisteEnMuelle) {
      Alert.alert(
        "Código Duplicado",
        `El pedido "${codigoLimpio}" ya está escaneado en esta misma sesión.`,
      );
      return;
    }

    // 2. VALIDACIÓN HISTÓRICA: Verificación contra stock físico
    try {
      const stockHistoricoRaw = await AsyncStorage.getItem(
        "historico_recepciones",
      );
      if (stockHistoricoRaw) {
        const historico = JSON.parse(stockHistoricoRaw);
        let yaExisteEnStockFisico = false;
        for (const rec of historico) {
          if (
            rec.detalleBultos &&
            rec.detalleBultos.some(
              (b: any) => b.numeroPedido === codigoLimpio && !b.borrado,
            )
          ) {
            yaExisteEnStockFisico = true;
            break;
          }
        }

        if (yaExisteEnStockFisico) {
          Alert.alert(
            "Pedido ya Registrado",
            `El código "${codigoLimpio}" ya consta en el stock actual del almacén.`,
          );
          return;
        }
      }
    } catch (error) {
      Alert.alert(
        "Error de Verificación",
        "No se pudo comprobar la base de datos de stock.",
      );
      return;
    }

    // Control de límites volumétricos por UCO (Excluyendo los borrados lógicos)
    const maxTeoricosUco = parseInt(
      inputsAlbaran[modalUcoSeleccionada]?.bultos || "0",
    );
    const yaEscaneadosUco = bultosEscaneados.filter(
      (b) => b.ucoAsignada === modalUcoSeleccionada && !b.borrado,
    ).length;

    if (yaEscaneadosUco >= maxTeoricosUco) {
      const ucoNom = listaUcosDisponibles.find(
        (u) => u.id === modalUcoSeleccionada,
      )?.nombre;
      Alert.alert(
        "Límite Excedido",
        `No puedes añadir más bultos a ${ucoNom}. Límite del albarán: ${maxTeoricosUco}.`,
      );
      return;
    }

    // 🌟 Si el bulto fue borrado lógicamente en esta misma sesión antes, lo recuperamos con datos nuevos
    const indicePrevioBorrado = bultosEscaneados.findIndex(
      (b) => b.numeroPedido === codigoLimpio && b.borrado,
    );

    const datosBultoActualizado: BultoEscaneado = {
      idBulto:
        indicePrevioBorrado !== -1
          ? bultosEscaneados[indicePrevioBorrado].idBulto
          : `BULTO_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      numeroPedido: codigoLimpio,
      cip: modalCip.trim().toUpperCase(),
      propietario: modalPropietario.trim() || "SIN PROPIETARIO",
      ucoAsignada: modalUcoSeleccionada,
      updatedAt: new Date().toISOString(), // 🌟 Timestamp fresco de inserción
      borrado: false, // 🌟 Se da de alta activo
    };

    if (indicePrevioBorrado !== -1) {
      const copiaBultos = [...bultosEscaneados];
      copiaBultos[indicePrevioBorrado] = datosBultoActualizado;
      setBultosEscaneados(copiaBultos);
    } else {
      setBultosEscaneados([...bultosEscaneados, datosBultoActualizado]);
    }

    // Limpiar formulario interno
    setModalNumeroPedido("");
    setModalCip("");
    setModalPropietario("");
    setModalVisible(false);
  };

  // 🌟 ACCIÓN MODIFICADA: Aplicar borrado lógico en caliente en lugar de .filter destructivo
  const eliminarBultoEnCaliente = (idBultoAEliminar: string) => {
    const listaModificada = bultosEscaneados.map((b) => {
      if (b.idBulto === idBultoAEliminar) {
        return {
          ...b,
          borrado: true,
          updatedAt: new Date().toISOString(), // 🌟 Marcamos fecha para que viaje la baja en P2P
        };
      }
      return b;
    });
    setBultosEscaneados(listaModificada);
  };

  const pausarRecepcion = async () => {
    await guardarPrevalidoEnCaliente(fase);
    Alert.alert(
      "Recepción Pausada",
      "Los datos se guardaron. Volviendo al menú principal.",
      [{ text: "Ok", onPress: () => router.replace("/menu") }],
    );
  };

  const cancelarYBorrarRecepcion = () => {
    Alert.alert(
      "Anular Recepción",
      "¿Seguro que quieres borrar todos los datos introducidos?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Sí, anular todo",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.removeItem("recepcion_en_progreso");
            router.replace("/menu");
          },
        },
      ],
    );
  };

  const finalizarRecepcionDefinitiva = async () => {
    const bultosTotalesTeoricos = obtenerTotalBultosTeoricos();
    // 🌟 Contamos solo los bultos activos reales para la validación de cierre
    const bultosActivosCount = bultosEscaneados.filter(
      (b) => !b.borrado,
    ).length;

    if (bultosActivosCount < bultosTotalesTeoricos) {
      Alert.alert(
        "Conteo Incompleto",
        `Faltan bultos por registrar. Llevas ${bultosActivosCount} de ${bultosTotalesTeoricos}.`,
      );
      return;
    }

    try {
      const stockHistoricoRaw = await AsyncStorage.getItem(
        "historico_recepciones",
      );
      const historico = stockHistoricoRaw ? JSON.parse(stockHistoricoRaw) : [];

      const filasFinales: { [idUco: string]: FilaAlbaran } = {};
      listaUcosDisponibles.forEach((uco) => {
        const datos = inputsAlbaran[uco.id];
        const numBultos = parseInt(datos?.bultos || "0");
        if (numBultos > 0) {
          filasFinales[uco.id] = {
            idUco: uco.id,
            nombreUco: uco.nombre,
            bultosTeoricos: numBultos,
            albaran: datos.albaran.trim().toUpperCase(),
          };
        }
      });

      const nuevaRecepcionCerrada = {
        idRecepcion,
        fechaFinalizacion: new Date().toISOString(),
        operario: operarioActual,
        periodoRecepcion: periodoAsignadoFinal,
        updatedAt: new Date().toISOString(),
        ucosAfectadas: filasFinales,
        detalleBultos: bultosEscaneados, // 🌟 Se guardan todos (activos y borrados) para el merge P2P
      };
      historico.push(nuevaRecepcionCerrada);

      await AsyncStorage.setItem(
        "historico_recepciones",
        JSON.stringify(historico),
      );
      await AsyncStorage.removeItem("recepcion_en_progreso");

      Alert.alert(
        "Éxito",
        `Recepción guardada e incorporada al Stock histórico en el periodo: ${periodoAsignadoFinal}`,
        [{ text: "Ok", onPress: () => router.replace("/menu") }],
      );
    } catch (e) {
      Alert.alert("Error", "No se pudo consolidar la recepción en disco.");
    }
  };

  const obtenerTotalBultosTeoricos = () => {
    let total = 0;
    listaUcosDisponibles.forEach((u) => {
      total += parseInt(inputsAlbaran[u.id]?.bultos || "0") || 0;
    });
    return total;
  };

  const ucosConBultosDeclarados = listaUcosDisponibles.filter(
    (u) => (parseInt(inputsAlbaran[u.id]?.bultos || "0") || 0) > 0,
  );

  return (
    <View style={styles.contenedorBase}>
      <View style={styles.cabeceraFija}>
        <Text style={styles.tituloId}>{idRecepcion}</Text>
        <Text style={styles.subtituloMeta}>
          Operario: {operarioActual} | Hardware:{" "}
          {tipoHardware === "skorpio_laser"
            ? "📟 Skorpio Laser"
            : "📱 Android Cam"}
        </Text>
        {fase === 2 && (
          <Text style={styles.subtituloPeriodoFase2}>
            📅 Asignado a: {periodoAsignadoFinal}
          </Text>
        )}
      </View>

      {/* FASE 1 */}
      {fase === 1 && (
        <ScrollView style={styles.cuerpoScroll}>
          <Text style={styles.tituloSeccion}>
            Paso 1: Configurar Período y Albaranes
          </Text>

          <View style={styles.tarjetaPeriodoRetroactivo}>
            <Text style={styles.labelFiltroPeriodo}>📆 FECHA DE RECEPCION</Text>
            <View style={styles.contenedorFilaPeriodo}>
              <View style={{ flex: 1 }}>
                <Text style={styles.microEtiqueta}>Mes:</Text>
                <TextInput
                  style={styles.inputMini}
                  placeholder="Ej: Mayo"
                  value={mesRecepcion}
                  onChangeText={setMesRecepcion}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.microEtiqueta}>Año:</Text>
                <TextInput
                  style={styles.inputMini}
                  placeholder="Ej: 2026"
                  keyboardType="numeric"
                  value={anioRecepcion}
                  onChangeText={setAnioRecepcion}
                />
              </View>
            </View>
          </View>

          <Text style={styles.tituloSeccionSegmento}>Declaración por UCO</Text>
          {listaUcosDisponibles.map((uco) => (
            <View key={uco.id} style={styles.tarjetaFilaUco}>
              <Text style={styles.nombreUcoFila}>🏢 {uco.nombre}</Text>
              <View style={styles.contenedorInputsFila}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.microEtiqueta}>Bultos:</Text>
                  <TextInput
                    style={styles.inputMini}
                    placeholder="0"
                    keyboardType="numeric"
                    value={inputsAlbaran[uco.id]?.bultos || ""}
                    onChangeText={(txt) =>
                      setInputsAlbaran({
                        ...inputsAlbaran,
                        [uco.id]: { ...inputsAlbaran[uco.id], bultos: txt },
                      })
                    }
                  />
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={styles.microEtiqueta}>Nº Albarán:</Text>
                  <TextInput
                    style={styles.inputMini}
                    placeholder="Ej: 11823"
                    value={inputsAlbaran[uco.id]?.albaran || ""}
                    onChangeText={(txt) =>
                      setInputsAlbaran({
                        ...inputsAlbaran,
                        [uco.id]: { ...inputsAlbaran[uco.id], albaran: txt },
                      })
                    }
                  />
                </View>
              </View>
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* FASE 2 */}
      {fase === 2 && (
        <View style={{ flex: 1 }}>
          <View style={styles.marcadorProgresoContainer}>
            <Text style={styles.textoMarcadorProgreso}>
              Conteo:{" "}
              <Text style={{ fontWeight: "bold" }}>
                {bultosEscaneados.filter((b) => !b.borrado).length}
              </Text>{" "}
              de{" "}
              <Text style={{ fontWeight: "bold" }}>
                {obtenerTotalBultosTeoricos()}
              </Text>{" "}
              bultos asignados.
            </Text>
          </View>

          <View style={styles.panelAccionesMuelle}>
            <TouchableOpacity
              style={[styles.btnMuelle, { backgroundColor: "#9b59b6" }]}
              onPress={() => {
                if (ucosConBultosDeclarados.length > 0 && !modalUcoSeleccionada)
                  setModalUcoSeleccionada(ucosConBultosDeclarados[0].id);
                setModalVisible(true);
              }}
            >
              <Text style={styles.textoBtnMuelle}>➕ Agregar Pedido</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btnMuelle,
                { backgroundColor: "#2ecc71" },
                bultosEscaneados.filter((b) => !b.borrado).length !==
                  obtenerTotalBultosTeoricos() && {
                  opacity: 0.5,
                },
              ]}
              onPress={finalizarRecepcionDefinitiva}
            >
              <Text style={styles.textoBtnMuelle}>✅ Finalizar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.cuerpoScroll}>
            {bultosEscaneados.filter((b) => !b.borrado).length === 0 ? (
              <Text style={styles.textoFilaVacia}>
                Muelle vacío. Pulsa "Agregar Pedido" para registrar el material.
              </Text>
            ) : (
              bultosEscaneados
                .filter((b) => !b.borrado) // 🌟 Filtro dinámico en UI para ignorar los borrados lógicos
                .map((bulto) => (
                  <View key={bulto.idBulto} style={styles.tarjetaBultoLista}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bultoPedidoTxt}>
                        📦 Pedido: {bulto.numeroPedido}
                      </Text>
                      <Text style={styles.bultoDetalleTxt}>
                        CIP: {bulto.cip} | Destino:{" "}
                        {
                          listaUcosDisponibles.find(
                            (u) => u.id === bulto.ucoAsignada,
                          )?.nombre
                        }
                      </Text>
                      <Text style={styles.bultoPropietarioTxt}>
                        Propietario: {bulto.propietario}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => eliminarBultoEnCaliente(bulto.idBulto)} // 🌟 Llama a la nueva función de baja lógica
                      style={styles.btnQuitarBulto}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "bold",
                          fontSize: 12,
                        }}
                      >
                        Quitar
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      )}

      {/* BARRA ACCIONES INFERIORES */}
      <View style={styles.barraAccionesFijas}>
        <TouchableOpacity
          style={styles.btnAccionBaja}
          onPress={cancelarYBorrarRecepcion}
        >
          <Text style={styles.textoBtnAccionBaja}>❌ Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnAccionBaja}
          onPress={pausarRecepcion}
        >
          <Text style={styles.textoBtnAccionBaja}>⏸️ Pausar</Text>
        </TouchableOpacity>
        {fase === 1 && (
          <TouchableOpacity
            style={[styles.btnAccionBaja, { backgroundColor: "#3498db" }]}
            onPress={avanzarAFase2}
          >
            <Text style={[styles.textoBtnAccionBaja, { color: "#fff" }]}>
              Continuar ➡️
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* MODAL CAPTURA */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.contenedorOpacoModal}>
          <View style={styles.ventanaModalBlanca}>
            {tipoHardware === "skorpio_laser" && (
              <TextInput
                ref={inputModalLaserRef}
                style={styles.inputOcultoLaser}
                showSoftInputOnFocus={false}
                autoFocus={true}
                value=""
                onChangeText={alEscanearConLaserSkorpio}
              />
            )}

            {mostrandoCamara && tipoHardware === "android_camara" ? (
              <View style={styles.contenedorVisorCamara}>
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  barcodeScannerSettings={{
                    barcodeTypes: ["code128", "code39", "qr", "ean13"],
                  }}
                  onBarcodeScanned={alEscanearConCamara}
                />
                <View style={styles.guiaEnfoqueCamara} />
                <TouchableOpacity
                  style={styles.btnCerrarCamara}
                  onPress={() => setMostrandoCamara(false)}
                >
                  <Text style={{ color: "#fff", fontWeight: "bold" }}>
                    Teclado Manual
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.tituloModal}>Ingresar Datos del Bulto</Text>

                {tipoHardware === "skorpio_laser" && (
                  <View style={styles.bannerLaserAviso}>
                    <Text style={styles.txtBannerLaser}>
                      📟 LÁSER SKORPIO ACTIVO: Dispara el gatillo
                    </Text>
                  </View>
                )}

                <Text style={styles.labelModal}>
                  Asignar a UCO Destino (*):
                </Text>
                <View style={styles.contenedorComboUcos}>
                  {ucosConBultosDeclarados.map((u) => (
                    <TouchableOpacity
                      key={u.id}
                      style={[
                        styles.itemComboUco,
                        modalUcoSeleccionada === u.id &&
                          styles.itemComboUcoActivo,
                      ]}
                      onPress={() => setModalUcoSeleccionada(u.id)}
                    >
                      <Text
                        style={[
                          styles.txtComboUco,
                          modalUcoSeleccionada === u.id && { color: "#fff" },
                        ]}
                      >
                        {u.nombre}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.labelModal}>
                  Número de Pedido / Código de Barras (*):
                </Text>
                <View style={styles.zonaInputEscaner}>
                  <TextInput
                    style={[styles.inputModal, { flex: 1, marginBottom: 0 }]}
                    placeholder={
                      tipoHardware === "skorpio_laser"
                        ? "Usa el gatillo o escribe aquí"
                        : "Escribe o pulsa Scan"
                    }
                    value={modalNumeroPedido}
                    onChangeText={setModalNumeroPedido}
                  />
                  <TouchableOpacity
                    style={styles.btnDispararEscaner}
                    onPress={presionarBotonEscaner}
                  >
                    <Text style={{ fontWeight: "bold", color: "#2c3e50" }}>
                      {tipoHardware === "skorpio_laser"
                        ? "🎯 Enfocar"
                        : "📷 Scan"}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.labelModal}>
                  Código CIP del Material (*):
                </Text>
                <TextInput
                  style={styles.inputModal}
                  placeholder="Ej: CIP12003847"
                  value={modalCip}
                  onChangeText={setModalCip}
                  autoCapitalize="characters"
                />

                <Text style={styles.labelModal}>
                  Personal / Propietario Final (Opcional):
                </Text>
                <TextInput
                  style={styles.inputModal}
                  placeholder="Ej: Soldado Rey..."
                  value={modalPropietario}
                  onChangeText={setModalPropietario}
                />

                <View style={styles.zonaBotonesModal}>
                  <TouchableOpacity
                    style={[
                      styles.btnModalBase,
                      { backgroundColor: "#bdc3c7" },
                    ]}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={{ fontWeight: "bold", color: "#2c3e50" }}>
                      Volver
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.btnModalBase,
                      { backgroundColor: "#2ecc71" },
                    ]}
                    onPress={guardarBultoUnitario}
                  >
                    <Text style={{ fontWeight: "bold", color: "#fff" }}>
                      Guardar Bulto
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Los estilos se mantienen exactamente igual
const styles = StyleSheet.create({
  contenedorBase: { flex: 1, backgroundColor: "#f5f6fa" },
  cabeceraFija: {
    backgroundColor: "#79715B",
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderColor: "#5c5645",
  },
  tituloId: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  subtituloMeta: {
    fontSize: 11,
    color: "#e0dbcd",
    marginTop: 2,
    fontWeight: "500",
  },
  subtituloPeriodoFase2: {
    fontSize: 12,
    color: "#fff",
    marginTop: 4,
    fontWeight: "bold",
  },
  cuerpoScroll: { flex: 1, padding: 15 },
  tituloSeccion: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 12,
  },
  tituloSeccionSegmento: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#7f8c8d",
    marginTop: 15,
    marginBottom: 10,
  },
  tarjetaPeriodoRetroactivo: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: "#e1e1e1",
    backgroundColor: "#fcfcf9",
  },
  labelFiltroPeriodo: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#79715B",
    marginBottom: 8,
  },
  contenedorFilaPeriodo: { flexDirection: "row", gap: 10 },
  tarjetaFilaUco: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e1e1e1",
  },
  nombreUcoFila: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 8,
  },
  contenedorInputsFila: { flexDirection: "row", gap: 10 },
  microEtiqueta: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#95a5a6",
    marginBottom: 3,
  },
  inputMini: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#dcdde1",
    borderRadius: 5,
    padding: 8,
    fontSize: 14,
    color: "#2c3e50",
  },
  marcadorProgresoContainer: {
    backgroundColor: "#e8f4fd",
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "#d6eaf8",
  },
  textoMarcadorProgreso: {
    fontSize: 14,
    color: "#2980b9",
    textAlign: "center",
  },
  panelAccionesMuelle: {
    flexDirection: "row",
    padding: 15,
    gap: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderColor: "#e1e1e1",
  },
  btnMuelle: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  textoBtnMuelle: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  textoFilaVacia: {
    fontSize: 13,
    color: "#95a5a6",
    textAlign: "center",
    marginTop: 30,
    paddingHorizontal: 20,
  },
  tarjetaBultoLista: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e1e1e1",
    alignItems: "center",
  },
  bultoPedidoTxt: { fontSize: 15, fontWeight: "bold", color: "#2c3e50" },
  bultoDetalleTxt: { fontSize: 12, color: "#7f8c8d", marginTop: 2 },
  bultoPropietarioTxt: {
    fontSize: 11,
    color: "#16a085",
    marginTop: 2,
    fontWeight: "500",
  },
  btnQuitarBulto: {
    backgroundColor: "#e74c3c",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  barraAccionesFijas: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#e1e1e1",
    padding: 12,
    gap: 8,
  },
  btnAccionBaja: {
    flex: 1,
    backgroundColor: "#f1f2f6",
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#dcdde1",
  },
  textoBtnAccionBaja: { fontSize: 14, fontWeight: "bold", color: "#2c3e50" },
  contenedorOpacoModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  ventanaModalBlanca: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    minHeight: 350,
    overflow: "hidden",
  },
  tituloModal: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 15,
    textAlign: "center",
  },
  labelModal: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#7f8c8d",
    marginBottom: 5,
    marginTop: 10,
  },
  inputModal: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#dcdde1",
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    marginBottom: 5,
    color: "#2c3e50",
  },
  zonaInputEscaner: { flexDirection: "row", gap: 8, marginBottom: 5 },
  btnDispararEscaner: {
    backgroundColor: "#e2e8f0",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    justifyContent: "center",
    paddingHorizontal: 15,
  },
  contenedorComboUcos: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginBottom: 5,
  },
  itemComboUco: {
    backgroundColor: "#f1f2f6",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#dcdde1",
  },
  itemComboUcoActivo: { backgroundColor: "#9b59b6", borderColor: "#8e44ad" },
  txtComboUco: { fontSize: 11, fontWeight: "bold", color: "#7f8c8d" },
  zonaBotonesModal: { flexDirection: "row", gap: 10, marginTop: 25 },
  btnModalBase: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  inputOcultoLaser: { position: "absolute", width: 0, height: 0, opacity: 0 },
  bannerLaserAviso: {
    backgroundColor: "#e67e22",
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
  },
  txtBannerLaser: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
    textAlign: "center",
  },
  contenedorVisorCamara: {
    width: "100%",
    height: 300,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  guiaEnfoqueCamara: {
    width: "80%",
    height: 60,
    borderWidth: 2,
    borderColor: "#2ecc71",
    borderRadius: 4,
    backgroundColor: "transparent",
  },
  btnCerrarCamara: {
    position: "absolute",
    bottom: 15,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 6,
  },
});
