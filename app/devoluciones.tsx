import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCameraPermissions } from "expo-camera";
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

// --- INTERFACES COMPATIBLES ---
interface BultoStock {
  idBulto: string;
  numeroPedido: string;
  cip: string;
  propietario: string;
  ucoAsignada: string;
  updatedAt: string;
  borrado?: boolean;
  albaranAsociado?: string;
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

interface ItemDevuelto {
  idBulto: string;
  numeroPedido: string;
  cip: string;
  propietario: string;
  ucoAsignada: string;
  albaranAsociado: string;
  motivo: string;
  fechaDevolucion: string;
}

interface DevolucionSesion {
  idDevolucion: string;
  fecha: string;
  operario: string;
  updatedAt: string;
  articulos: ItemDevuelto[];
}

export default function DevolucionesScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  // Datos locales e infraestructura
  const [tipoHardware, setTipoHardware] = useState<string>("android_camara");
  const [historicoRecepciones, setHistoricoRecepciones] = useState<
    RecepcionCerrada[]
  >([]);
  const [historicoDevoluciones, setHistoricoDevoluciones] = useState<
    DevolucionSesion[]
  >([]);
  const [bultosTotalesStock, setBultosTotalesStock] = useState<BultoStock[]>(
    [],
  );

  // Estados del Flujo de la Devolución Activa
  const [enProcesoDevolucion, setEnProcesoDevolucion] = useState(false);
  const [operarioActual, setOperarioActual] = useState("");
  const [inputNombreOperario, setInputNombreOperario] = useState("");
  const [carritoDevoluciones, setCarritoDevoluciones] = useState<
    ItemDevuelto[]
  >([]);

  // SELECTORES MANUALES PARA EL FLUJO GUIADO DE STOCK
  const [listaUcosFiltro, setListaUcosFiltro] = useState<string[]>([]);
  const [ucoSeleccionada, setUcoSeleccionada] = useState<string>("TODAS");
  const [listaAlbaranesDisponibles, setListaAlbaranesDisponibles] = useState<
    string[]
  >([]);
  const [albaranSeleccionado, setAlbaranSeleccionado] =
    useState<string>("TODOS");
  const [bultosVisiblesFiltrados, setBultosVisiblesFiltrados] = useState<
    BultoStock[]
  >([]);
  const [busquedaTexto, setBusquedaTexto] = useState("");

  // Modales de control de interfaz
  const [modalInicioVisible, setModalInicioVisible] = useState(false);
  const [modalBultoVisible, setModalBultoVisible] = useState(false);
  const [modalHistoricoVisible, setModalHistoricoVisible] = useState(false);
  const [mostrandoCamara, setMostrandoCamara] = useState(false);

  // Datos del bulto bajo asignación de motivo
  const [bultoEscaneado, setBultoEscaneado] = useState<BultoStock | null>(null);
  const [motivoSeleccionado, setMotivoSeleccionado] =
    useState("FUERA DE PLAZO");
  const [motivoPersonalizado, setMotivoPersonalizado] = useState("");

  // Escáner láser rápido (Skorpio X5)
  const [inputLaser, setInputLaser] = useState("");
  const inputLaserRef = useRef<TextInput>(null);

  const motivosPredefinidos = [
    "FUERA DE PLAZO",
    "CAMBIO DE DESTINO",
    "MATERIAL DEFECTUOSO",
    "ERROR DE ALBARÁN",
    "OTRO (Especificar)",
  ];

  useEffect(() => {
    cargarDatosBase();
  }, []);

  // Sincronizar listados dinámicos de filtrado de stock en la devolución
  useEffect(() => {
    aplicarFiltrosCatalogo();
  }, [
    ucoSeleccionada,
    albaranSeleccionado,
    busquedaTexto,
    bultosTotalesStock,
    carritoDevoluciones,
  ]);

  // Recalcular albaranes al cambiar de UCO
  useEffect(() => {
    if (ucoSeleccionada === "TODAS") {
      setListaAlbaranesDisponibles([]);
      setAlbaranSeleccionado("TODOS");
    } else {
      const albaranesDeUco = bultosTotalesStock
        .filter((b) => b.ucoAsignada === ucoSeleccionada)
        .map((b) => b.albaranAsociado || "S/A");
      setListaAlbaranesDisponibles(Array.from(new Set(albaranesDeUco)));
      setAlbaranSeleccionado("TODOS");
    }
  }, [ucoSeleccionada, bultosTotalesStock]);

  useEffect(() => {
    let loopEnfoque: NodeJS.Timeout;
    if (
      enProcesoDevolucion &&
      tipoHardware === "skorpio_laser" &&
      !mostrandoCamara &&
      !modalBultoVisible &&
      !modalInicioVisible
    ) {
      loopEnfoque = setInterval(() => {
        inputLaserRef.current?.focus();
      }, 300);
    }
    return () => {
      if (loopEnfoque) clearInterval(loopEnfoque);
    };
  }, [
    enProcesoDevolucion,
    tipoHardware,
    mostrandoCamara,
    modalBultoVisible,
    modalInicioVisible,
  ]);

  const normalizarTexto = (texto: string) => {
    if (!texto) return "";
    return texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  };

  const cargarDatosBase = async () => {
    try {
      const hw = await AsyncStorage.getItem("dispositivo_escaneo");
      setTipoHardware(hw || "android_camara");

      const histRec = await AsyncStorage.getItem("historico_recepciones");
      if (histRec) {
        const historico: RecepcionCerrada[] = JSON.parse(histRec);
        setHistoricoRecepciones(historico);

        const bolsaBultos: BultoStock[] = [];
        const ucosUnicas = new Set<string>();

        historico.forEach((recep) => {
          if (recep.detalleBultos) {
            recep.detalleBultos.forEach((bulto) => {
              if (!bulto.borrado) {
                let albaranEncontrado = "S/A";
                if (recep.ucosAfectadas) {
                  const bultoUcoNorm = normalizarTexto(bulto.ucoAsignada);
                  if (recep.ucosAfectadas[bulto.ucoAsignada]?.albaran) {
                    albaranEncontrado =
                      recep.ucosAfectadas[bulto.ucoAsignada].albaran;
                  } else {
                    const fila = Object.values(recep.ucosAfectadas).find(
                      (f) =>
                        normalizarTexto(f.nombreUco) === bultoUcoNorm ||
                        normalizarTexto(f.idUco) === bultoUcoNorm,
                    );
                    if (fila?.albaran) albaranEncontrado = fila.albaran;
                  }
                }

                bolsaBultos.push({
                  ...bulto,
                  albaranAsociado: albaranEncontrado,
                });
                if (bulto.ucoAsignada) ucosUnicas.add(bulto.ucoAsignada);
              }
            });
          }
        });

        setBultosTotalesStock(bolsaBultos);
        setListaUcosFiltro(Array.from(ucosUnicas));
      }

      const histDev = await AsyncStorage.getItem("historico_devoluciones");
      if (histDev) setHistoricoDevoluciones(JSON.parse(histDev));
    } catch (e) {
      Alert.alert("Error", "No se pudieron iniciar las existencias.");
    }
  };

  const aplicarFiltrosCatalogo = () => {
    let temporal = [...bultosTotalesStock];

    const idsEnCarrito = carritoDevoluciones.map((c) => c.idBulto);
    temporal = temporal.filter((b) => !idsEnCarrito.includes(b.idBulto));

    if (ucoSeleccionada !== "TODAS") {
      temporal = temporal.filter((b) => b.ucoAsignada === ucoSeleccionada);
      if (albaranSeleccionado !== "TODOS") {
        temporal = temporal.filter(
          (b) => (b.albaranAsociado || "S/A") === albaranSeleccionado,
        );
      }
    }

    if (busquedaTexto.trim() !== "") {
      const query = busquedaTexto.toLowerCase().trim();
      temporal = temporal.filter(
        (b) =>
          b.idBulto.toLowerCase().includes(query) ||
          b.numeroPedido.toLowerCase().includes(query) ||
          b.cip.toLowerCase().includes(query) ||
          (b.propietario && b.propietario.toLowerCase().includes(query)),
      );
    }
    setBultosVisiblesFiltrados(temporal);
  };

  const abrirModalInicioDevolucion = () => {
    setInputNombreOperario("");
    setModalInicioVisible(true);
  };

  const confirmarInicioDevolucion = () => {
    if (!inputNombreOperario || inputNombreOperario.trim() === "") {
      Alert.alert(
        "Campo Requerido",
        "Por favor, introduce el nombre o código de operario militar.",
      );
      return;
    }
    setOperarioActual(inputNombreOperario.trim().toUpperCase());
    setCarritoDevoluciones([]);
    setUcoSeleccionada("TODAS");
    setAlbaranSeleccionado("TODOS");
    setBusquedaTexto("");
    setModalInicioVisible(false);
    setEnProcesoDevolucion(true);
  };

  const procesarSeleccionBulto = (bulto: BultoStock) => {
    setBultoEscaneado(bulto);
    setMotivoSeleccionado("FUERA DE PLAZO");
    setMotivoPersonalizado("");
    setModalBultoVisible(true);
  };

  const buscarPorDisparoLaser = (codigoLeido: string) => {
    const lim = codigoLeido.trim().toUpperCase();
    if (!lim) return;
    setInputLaser("");

    const bulto = bultosTotalesStock.find(
      (b) =>
        !b.borrado &&
        (b.idBulto.toUpperCase() === lim ||
          b.numeroPedido.toUpperCase() === lim ||
          b.cip.toUpperCase() === lim),
    );

    if (bulto) {
      if (carritoDevoluciones.some((c) => c.idBulto === bulto.idBulto)) {
        Alert.alert("Aviso", "Este bulto ya está en el carrito.");
        return;
      }
      procesarSeleccionBulto(bulto);
    } else {
      Alert.alert(
        "No Localizado",
        `El código [${lim}] no se encuentra disponible en las existencias.`,
      );
    }
  };

  const confirmarAñadirAlCarrito = () => {
    if (!bultoEscaneado) return;

    const motivoFinal =
      motivoSeleccionado === "OTRO (Especificar)"
        ? motivoPersonalizado.trim().toUpperCase()
        : motivoSeleccionado;
    if (!motivoFinal) {
      Alert.alert("Error", "Debes detallar un motivo.");
      return;
    }

    const nuevoItem: ItemDevuelto = {
      idBulto: bultoEscaneado.idBulto,
      numeroPedido: bultoEscaneado.numeroPedido,
      cip: bultoEscaneado.cip,
      propietario: bultoEscaneado.propietario,
      ucoAsignada: bultoEscaneado.ucoAsignada,
      albaranAsociado: bultoEscaneado.albaranAsociado || "S/A",
      motivo: motivoFinal,
      fechaDevolucion: new Date().toLocaleString("es-ES"),
    };

    setCarritoDevoluciones([...carritoDevoluciones, nuevoItem]);
    setModalBultoVisible(false);
    setBultoEscaneado(null);
  };

  const finalizarYGrabarDevolucion = async () => {
    if (carritoDevoluciones.length === 0) {
      Alert.alert(
        "Error",
        "No hay ningún bulto seleccionado en la devolución.",
      );
      return;
    }

    Alert.alert(
      "Confirmar Registro",
      `¿Procesar la baja definitiva de ${carritoDevoluciones.length} bultos del Stock?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Confirmar y Grabar",
          onPress: async () => {
            try {
              const ahoraIso = new Date().toISOString();
              const IDsABorrar = carritoDevoluciones.map((c) => c.idBulto);

              const historicoActualizado = historicoRecepciones.map((rec) => {
                let cambiado = false;
                const bultosModificados = rec.detalleBultos.map((b) => {
                  if (IDsABorrar.includes(b.idBulto)) {
                    cambiado = true;
                    return { ...b, borrado: true, updatedAt: ahoraIso };
                  }
                  return b;
                });
                return cambiado
                  ? {
                      ...rec,
                      updatedAt: ahoraIso,
                      detalleBultos: bultosModificados,
                    }
                  : rec;
              });

              const nuevaSesion: DevolucionSesion = {
                idDevolucion: `DEV-${Math.floor(100000 + Math.random() * 900000)}`,
                fecha: new Date().toLocaleString("es-ES"),
                operario: operarioActual,
                updatedAt: ahoraIso,
                articulos: carritoDevoluciones,
              };

              const nuevoHistDev = [nuevaSesion, ...historicoDevoluciones];

              await AsyncStorage.setItem(
                "historico_recepciones",
                JSON.stringify(historicoActualizado),
              );
              await AsyncStorage.setItem(
                "historico_devoluciones",
                JSON.stringify(nuevoHistDev),
              );

              setHistoricoRecepciones(historicoActualizado);
              setHistoricoDevoluciones(nuevoHistDev);

              Alert.alert(
                "Éxito",
                "Material dado de baja del stock y registrado en el histórico.",
              );
              setEnProcesoDevolucion(false);
              setCarritoDevoluciones([]);
              await cargarDatosBase();
            } catch (e) {
              Alert.alert("Error", "No se pudieron salvar los registros.");
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.contenedorBase}>
      {enProcesoDevolucion &&
        tipoHardware === "skorpio_laser" &&
        !mostrandoCamara &&
        !modalBultoVisible &&
        !modalInicioVisible && (
          <TextInput
            ref={inputLaserRef}
            style={styles.inputOcultoLaser}
            showSoftInputOnFocus={false}
            autoFocus={true}
            value={inputLaser}
            onChangeText={(t) => {
              if (t.includes("\n") || t.length > 10) {
                buscarPorDisparoLaser(t.replace("\n", "").trim());
                setInputLaser("");
              } else {
                setInputLaser(t);
              }
            }}
          />
        )}

      {/* CABECERA */}
      <View style={styles.cabecera}>
        <Text style={styles.tituloPantalla}>Gestión de Devoluciones</Text>
        <Text style={styles.subtituloMeta}>
          Bajas lógicas y retornos coordinados
        </Text>
      </View>

      {!enProcesoDevolucion ? (
        <View style={styles.centroMenu}>
          <TouchableOpacity
            style={styles.btnPrincipalGrande}
            onPress={abrirModalInicioDevolucion}
          >
            <Text style={styles.txtBtnGrande}>📦 Crear Nueva Devolución</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.btnPrincipalGrande,
              { backgroundColor: "#34495e", marginTop: 15 },
            ]}
            onPress={() => setModalHistoricoVisible(true)}
          >
            <Text style={styles.txtBtnGrande}>
              🕒 Historial de Devoluciones
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnVolver}
            onPress={() => router.replace("/menu")}
          >
            <Text style={styles.txtVolver}>Volver al Menú Principal</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* BANNER OPERARIO */}
          <View style={styles.bannerOperario}>
            <Text style={styles.txtOperario}>
              Operario: {operarioActual} | Carrito: {carritoDevoluciones.length}{" "}
              bultos
            </Text>
            <TouchableOpacity
              style={styles.btnCancelarDevo}
              onPress={() => {
                setEnProcesoDevolucion(false);
                setCarritoDevoluciones([]);
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>
                Salir
              </Text>
            </TouchableOpacity>
          </View>

          {/* SECCIÓN DE FILTRADO Y NAVEGACIÓN GUIADA DE STOCK */}
          <View style={styles.contenedorSelectorStock}>
            <Text style={styles.lblMiniSeccion}>
              1. Selecciona la UCO Destino:
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scrollFiltros}
            >
              <TouchableOpacity
                style={[
                  styles.pildora,
                  ucoSeleccionada === "TODAS" && styles.pildoraActiva,
                ]}
                onPress={() => setUcoSeleccionada("TODAS")}
              >
                <Text
                  style={[
                    styles.txtPildora,
                    ucoSeleccionada === "TODAS" && { color: "#fff" },
                  ]}
                >
                  🏢 Todas
                </Text>
              </TouchableOpacity>
              {listaUcosFiltro.map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[
                    styles.pildora,
                    ucoSeleccionada === u && styles.pildoraActiva,
                  ]}
                  onPress={() => setUcoSeleccionada(u)}
                >
                  <Text
                    style={[
                      styles.txtPildora,
                      ucoSeleccionada === u && { color: "#fff" },
                    ]}
                  >
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {ucoSeleccionada !== "TODAS" &&
              listaAlbaranesDisponibles.length > 0 && (
                <View style={{ marginTop: 6 }}>
                  <Text style={styles.lblMiniSeccion}>
                    2. Selecciona el Albarán:
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.scrollFiltros}
                  >
                    <TouchableOpacity
                      style={[
                        styles.pildoraAlb,
                        albaranSeleccionado === "TODOS" &&
                          styles.pildoraAlbActiva,
                      ]}
                      onPress={() => setAlbaranSeleccionado("TODOS")}
                    >
                      <Text
                        style={[
                          styles.txtPildora,
                          albaranSeleccionado === "TODOS" && { color: "#fff" },
                        ]}
                      >
                        📋 Todos
                      </Text>
                    </TouchableOpacity>
                    {listaAlbaranesDisponibles.map((a) => (
                      <TouchableOpacity
                        key={a}
                        style={[
                          styles.pildoraAlb,
                          albaranSeleccionado === a && styles.pildoraAlbActiva,
                        ]}
                        onPress={() => setAlbaranSeleccionado(a)}
                      >
                        <Text
                          style={[
                            styles.txtPildora,
                            albaranSeleccionado === a && { color: "#fff" },
                          ]}
                        >
                          📄 {a}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

            <TextInput
              style={styles.miniBuscadorText}
              placeholder="🔍 Escribe ID, Pedido o CIP para filtrar..."
              value={busquedaTexto}
              onChangeText={setBusquedaTexto}
            />
          </View>

          {/* LISTADO DE SELECCIÓN DE PEDIDOS EN STOCK */}
          <Text style={styles.subtituloSeccion}>
            3. Selecciona los bultos para Devolver (
            {bultosVisiblesFiltrados.length}):
          </Text>
          <ScrollView style={styles.catalogoStockScroll}>
            {bultosVisiblesFiltrados.length === 0 ? (
              <Text style={styles.textoListaVacia}>
                No quedan existencias disponibles bajo el cuadrante
                seleccionado.
              </Text>
            ) : (
              bultosVisiblesFiltrados.map((item) => (
                <TouchableOpacity
                  key={item.idBulto}
                  style={styles.tarjetaCatalogoStock}
                  onPress={() => procesarSeleccionBulto(item)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txtCatBulto}>
                      📦 ID Bulto: {item.idBulto}
                    </Text>
                    <Text style={styles.txtCatMeta}>
                      Pedido:{" "}
                      <Text style={{ fontWeight: "bold" }}>
                        {item.numeroPedido}
                      </Text>{" "}
                      | CIP: {item.cip}
                    </Text>
                    <Text style={styles.txtCatMeta}>
                      UCO: {item.ucoAsignada} | Albarán: {item.albaranAsociado}
                    </Text>
                    <Text style={styles.txtCatTitular}>
                      Titular: {item.propietario || "Logística General"}
                    </Text>
                  </View>
                  <View style={styles.badgeAccionAgregar}>
                    <Text
                      style={{
                        color: "#e67e22",
                        fontWeight: "bold",
                        fontSize: 11,
                      }}
                    >
                      DEVOLVER ↩️
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          {/* ELEMENTOS YA AGREGADOS AL CARRITO */}
          {carritoDevoluciones.length > 0 && (
            <View style={styles.contenedorSeccionCarritoAbajo}>
              <Text style={styles.tituloCarritoAbajo}>
                Bultos seleccionados en esta orden ({carritoDevoluciones.length}
                ):
              </Text>
              <ScrollView
                style={{
                  backgroundColor: "#fafafa",
                  borderRadius: 6,
                  padding: 5,
                  maxHeight: 110,
                }}
              >
                {carritoDevoluciones.map((c, i) => (
                  <View key={i} style={styles.filaResumenCarrito}>
                    <Text style={styles.txtFilaCar}>
                      • ID: {c.idBulto} (Alb: {c.albaranAsociado}) -{" "}
                      <Text style={{ color: "#c0392b", fontWeight: "600" }}>
                        {c.motivo}
                      </Text>
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        setCarritoDevoluciones(
                          carritoDevoluciones.filter((_, idx) => idx !== i),
                        )
                      }
                    >
                      <Text
                        style={{
                          color: "#c0392b",
                          fontWeight: "bold",
                          paddingHorizontal: 5,
                        }}
                      >
                        [Quitar]
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.barraAccionesInferior}>
            <TouchableOpacity
              style={styles.btnGrabarFinal}
              onPress={finalizarYGrabarDevolucion}
            >
              <Text style={styles.txtGrabarFinal}>
                💾 Terminar y Confirmar Salida de Stock
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* MODAL 1: INICIALIZACIÓN DE OPERARIO */}
      <Modal visible={modalInicioVisible} animationType="slide" transparent>
        <View style={styles.fondoOpacoModal}>
          <View style={styles.cajaBlancaModal}>
            <Text style={styles.modalTitulo}>Identificación del Operario</Text>
            <Text style={styles.labelFiltro}>
              Introduce el nombre o código del operario militar a cargo:
            </Text>
            <TextInput
              style={styles.inputOperarioForm}
              placeholder="Ej: SOLDADO GÓMEZ / OP-42"
              placeholderTextColor="#94a3b8"
              value={inputNombreOperario}
              onChangeText={setInputNombreOperario}
              autoCapitalize="characters"
            />
            <View style={styles.botonesModalFila}>
              <TouchableOpacity
                style={[styles.btnModal, { backgroundColor: "#bdc3c7" }]}
                onPress={() => setModalInicioVisible(false)}
              >
                <Text style={{ fontWeight: "bold", color: "#2c3e50" }}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnModal, { backgroundColor: "#e67e22" }]}
                onPress={confirmarInicioDevolucion}
              >
                <Text style={{ fontWeight: "bold", color: "#fff" }}>
                  Iniciar Devolución
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: SELECCIÓN DE MOTIVO */}
      <Modal visible={modalBultoVisible} animationType="slide" transparent>
        <View style={styles.fondoOpacoModal}>
          <View style={styles.cajaBlancaModal}>
            <Text style={styles.modalTitulo}>Asignar Motivo de Devolución</Text>
            {bultoEscaneado && (
              <View style={styles.detallesBultoModal}>
                <Text style={styles.txtBultoM}>
                  ID Bulto:{" "}
                  <Text style={{ fontWeight: "bold" }}>
                    {bultoEscaneado.idBulto}
                  </Text>
                </Text>
                <Text style={styles.txtBultoM}>
                  Pedido ref: {bultoEscaneado.numeroPedido} | Albarán:{" "}
                  {bultoEscaneado.albaranAsociado}
                </Text>
                <Text style={styles.txtBultoM}>
                  Unidad / Militar: {bultoEscaneado.ucoAsignada} (
                  {bultoEscaneado.propietario})
                </Text>
              </View>
            )}

            <Text style={styles.labelFiltro}>
              Selecciona el motivo de la baja estructural:
            </Text>
            <View style={styles.contenedorMotivosPildoras}>
              {motivosPredefinidos.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.pildoraMotivo,
                    motivoSeleccionado === m && styles.pildoraMotivoActiva,
                  ]}
                  onPress={() => setMotivoSeleccionado(m)}
                >
                  <Text
                    style={[
                      styles.txtPildora,
                      motivoSeleccionado === m && { color: "#fff" },
                    ]}
                  >
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {motivoSeleccionado === "OTRO (Especificar)" && (
              <TextInput
                style={styles.inputPersonalizado}
                placeholder="Escribe el motivo detallado aquí..."
                value={motivoPersonalizado}
                onChangeText={setMotivoPersonalizado}
              />
            )}

            <View style={styles.botonesModalFila}>
              <TouchableOpacity
                style={[styles.btnModal, { backgroundColor: "#bdc3c7" }]}
                onPress={() => {
                  setModalBultoVisible(false);
                  setBultoEscaneado(null);
                }}
              >
                <Text style={{ fontWeight: "bold", color: "#2c3e50" }}>
                  Descartar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnModal, { backgroundColor: "#e67e22" }]}
                onPress={confirmarAñadirAlCarrito}
              >
                <Text style={{ fontWeight: "bold", color: "#fff" }}>
                  Añadir al Carrito
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: HISTORIAL DE DEVOLUCIONES */}
      <Modal visible={modalHistoricoVisible} animationType="fade" transparent>
        <View style={styles.fondoOpacoModal}>
          <View style={[styles.cajaBlancaModal, { maxHeight: "85%" }]}>
            <Text style={styles.modalTitulo}>
              Historial Registrado de Salidas
            </Text>

            <ScrollView style={{ flex: 1, marginVertical: 10 }}>
              {historicoDevoluciones.length === 0 ? (
                <Text style={styles.textoListaVacia}>
                  No se registran devoluciones anteriores.
                </Text>
              ) : (
                historicoDevoluciones.map((sesion) => (
                  <View
                    key={sesion.idDevolucion}
                    style={styles.tarjetaHistDevo}
                  >
                    <View style={styles.cabeceraHistTarjeta}>
                      <Text style={styles.histId}>{sesion.idDevolucion}</Text>
                      <Text style={styles.histFecha}>📅 {sesion.fecha}</Text>
                    </View>
                    <Text style={styles.histOperario}>
                      Operario a cargo: {sesion.operario}
                    </Text>
                    <Text style={[styles.labelFiltro, { marginTop: 6 }]}>
                      Bultos Dados de Baja:
                    </Text>
                    {sesion.articulos.map((art, idx) => (
                      <Text key={idx} style={styles.txtSubArticulo}>
                        • ID: {art.idBulto} | Pedido: {art.numeroPedido} |
                        Albarán: {art.albaranAsociado} {"\n"}
                        {"  "}Motivo:{" "}
                        <Text style={{ fontWeight: "bold", color: "#c0392b" }}>
                          {art.motivo}
                        </Text>
                      </Text>
                    ))}
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.btnPrincipalGrande,
                { backgroundColor: "#79715B" },
              ]}
              onPress={() => setModalHistoricoVisible(false)}
            >
              <Text style={styles.txtBtnGrande}>Cerrar Historial</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedorBase: { flex: 1, backgroundColor: "#f5f6fa" },
  cabecera: {
    backgroundColor: "#79715B",
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 15,
  },
  tituloPantalla: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  subtituloMeta: { fontSize: 12, color: "#e0dbcd", marginTop: 2 },
  centroMenu: { flex: 1, justifyContent: "center", padding: 25 },
  btnPrincipalGrande: {
    backgroundColor: "#e67e22",
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
  txtBtnGrande: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  btnVolver: { marginTop: 40, alignItems: "center" },
  txtVolver: {
    color: "#7f8c8d",
    fontWeight: "bold",
    textDecorationLine: "underline",
  },
  bannerOperario: {
    backgroundColor: "#2c3e50",
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  txtOperario: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  btnCancelarDevo: {
    backgroundColor: "#c0392b",
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 4,
  },

  contenedorSelectorStock: {
    backgroundColor: "#fff",
    padding: 10,
    borderBottomWidth: 1,
    borderColor: "#cbd5e1",
  },
  lblMiniSeccion: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#57606f",
    marginBottom: 3,
  },
  scrollFiltros: { gap: 6, paddingBottom: 4 },
  pildora: {
    backgroundColor: "#f1f2f6",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  pildoraActiva: { backgroundColor: "#79715B", borderColor: "#5c5645" },
  pildoraAlb: {
    backgroundColor: "#f1f2f6",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  pildoraAlbActiva: { backgroundColor: "#2980b9", borderColor: "#1f618d" },
  txtPildora: { fontSize: 11, fontWeight: "bold", color: "#2c3e50" },
  miniBuscadorText: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    padding: 8,
    fontSize: 12,
    marginTop: 8,
    color: "#2c3e50",
  },

  subtituloSeccion: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#7f8c8d",
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  catalogoStockScroll: { flex: 1, paddingHorizontal: 12 },
  textoListaVacia: {
    fontSize: 12,
    color: "#95a5a6",
    textAlign: "center",
    marginTop: 25,
    paddingHorizontal: 20,
  },
  tarjetaCatalogoStock: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    elevation: 1,
  },
  txtCatBulto: { fontSize: 13, fontWeight: "bold", color: "#2c3e50" },
  txtCatMeta: { fontSize: 12, color: "#57606f", marginTop: 2 },
  txtCatTitular: {
    fontSize: 11,
    color: "#7f8c8d",
    marginTop: 1,
    fontStyle: "italic",
  },
  badgeAccionAgregar: {
    backgroundColor: "#fff3e0",
    borderWidth: 1,
    borderColor: "#ffe0b2",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },

  contenedorSeccionCarritoAbajo: {
    padding: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#cbd5e1",
  },
  tituloCarritoAbajo: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 4,
  },
  filaResumenCarrito: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f2f6",
  },
  txtFilaCar: { fontSize: 11, color: "#333" },

  barraAccionesInferior: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#cbd5e1",
    padding: 12,
  },
  btnGrabarFinal: {
    backgroundColor: "#27ae60",
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  txtGrabarFinal: { color: "#fff", fontWeight: "bold", fontSize: 14 },

  fondoOpacoModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  cajaBlancaModal: { backgroundColor: "#fff", borderRadius: 12, padding: 20 },
  modalTitulo: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2c3e50",
    textAlign: "center",
    marginBottom: 12,
  },
  detallesBultoModal: {
    backgroundColor: "#f8f9fa",
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e1e1e1",
    marginBottom: 12,
  },
  txtBultoM: { fontSize: 12, color: "#34495e", marginTop: 1 },
  labelFiltro: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7f8c8d",
    marginBottom: 6,
  },
  inputOperarioForm: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    color: "#2c3e50",
    marginBottom: 15,
  },
  contenedorMotivosPildoras: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  pildoraMotivo: {
    backgroundColor: "#f1f2f6",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dcdde1",
  },
  pildoraMotivoActiva: { backgroundColor: "#e67e22", borderColor: "#d35400" },
  inputPersonalizado: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    padding: 10,
    fontSize: 12,
    color: "#2c3e50",
    marginBottom: 12,
  },
  botonesModalFila: { flexDirection: "row", gap: 10, marginTop: 10 },
  btnModal: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  inputOcultoLaser: { position: "absolute", width: 1, height: 1, opacity: 0 },

  tarjetaHistDevo: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    marginBottom: 10,
  },
  cabeceraHistTarjeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: "#f1f2f6",
    paddingBottom: 4,
    marginBottom: 4,
  },
  histId: { fontSize: 13, fontWeight: "bold", color: "#2c3e50" },
  histFecha: { fontSize: 11, color: "#7f8c8d" },
  histOperario: { fontSize: 12, color: "#34495e" },
  txtSubArticulo: {
    fontSize: 11,
    color: "#57606f",
    marginLeft: 4,
    marginTop: 3,
  },
});
