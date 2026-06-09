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

// --- INTERFACES DEL HISTÓRICO ---
interface BultoStock {
  idBulto: string;
  numeroPedido: string;
  cip: string;
  propietario: string;
  ucoAsignada: string;
  updatedAt: string;
  borrado?: boolean;
  albaranAsociado?: string; // Se calcula dinámicamente en tiempo de lectura
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

export default function StockScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  // Estados de carga e infraestructura
  const [historicoRecepciones, setHistoricoRecepciones] = useState<
    RecepcionCerrada[]
  >([]);
  const [bultosTotales, setBultosTotales] = useState<BultoStock[]>([]);
  const [bultosFiltrados, setBultosFiltrados] = useState<BultoStock[]>([]);

  // Filtros Avanzados de Interfaz
  const [listaUcosFiltro, setListaUcosFiltro] = useState<string[]>([]);
  const [ucoSeleccionada, setUcoSeleccionada] = useState<string>("TODAS");

  // Gestión de pestañas de albaranes dinámicas
  const [listaAlbaranesDisponibles, setListaAlbaranesDisponibles] = useState<
    string[]
  >([]);
  const [albaranSeleccionado, setAlbaranSeleccionado] =
    useState<string>("TODOS");

  const [busquedaTexto, setBusquedaTexto] = useState("");

  // Modales, Láser y Cámara para las Entregas Directas
  const [modalEntregaVisible, setModalEntregaVisible] = useState(false);
  const [bultoAEntregar, setBultoAEntregar] = useState<BultoStock | null>(null);
  const [operarioEntrega, setOperarioEntrega] = useState("");
  const [obsEntrega, setObsEntrega] = useState("");

  const [menuMotivosAbierto, setMenuMotivosAbierto] = useState(false);
  const [motivoEntregaSeleccionado, setMotivoEntregaSeleccionado] = useState(
    "ENTREGA ORDINARIA (SERVICIO)",
  );
  const listaMotivosDisponibles = [
    "ENTREGA ORDINARIA (SERVICIO)",
    "BAJA POR ROTURA / DETERIORO",
    "EXTRAVIADO EN MUELLE",
    "REASIGNACIÓN ESTRUCTURAL",
  ];

  const inputLaserMuelleRef = useRef<TextInput>(null);
  const [bufferLaserMuelle, setBufferLaserMuelle] = useState("");
  const [camaraMuelleActiva, setCamaraMuelleActiva] = useState(false);

  useEffect(() => {
    cargarStockMuelle();
  }, []);

  useEffect(() => {
    aplicarLogicaFiltros();
  }, [ucoSeleccionada, albaranSeleccionado, busquedaTexto, bultosTotales]);

  // Recalcular pestañas de albaranes al cambiar de UCO
  useEffect(() => {
    if (ucoSeleccionada === "TODAS") {
      setListaAlbaranesDisponibles([]);
      setAlbaranSeleccionado("TODOS");
    } else {
      const albaranesDeUco = bultosTotales
        .filter((b) => b.ucoAsignada === ucoSeleccionada)
        .map((b) => b.albaranAsociado || "S/A");

      const unicos = Array.from(new Set(albaranesDeUco));
      setListaAlbaranesDisponibles(unicos);
      setAlbaranSeleccionado("TODOS");
    }
  }, [ucoSeleccionada, bultosTotales]);

  // Función auxiliar para limpiar cadenas y evitar fallos por tildes o espacios invisibles
  const normalizarTexto = (texto: string) => {
    if (!texto) return "";
    return texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Elimina acentos
      .trim();
  };

  const cargarStockMuelle = async () => {
    try {
      const operarioLocal =
        (await AsyncStorage.getItem("usuario_activo")) || "Desconocido";
      setOperarioEntrega(operarioLocal);

      const histRaw = await AsyncStorage.getItem("historico_recepciones");
      if (histRaw) {
        const historico: RecepcionCerrada[] = JSON.parse(histRaw);
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

                  // 🌟 COMPROBACIÓN ROBUSTA DOBLE (Por Clave ID o por Propiedad Nombre)
                  // 1. Intentar buscar si la ucoAsignada coincide directamente con la clave ID de ucosAfectadas
                  if (
                    recep.ucosAfectadas[bulto.ucoAsignada] &&
                    recep.ucosAfectadas[bulto.ucoAsignada].albaran
                  ) {
                    albaranEncontrado =
                      recep.ucosAfectadas[bulto.ucoAsignada].albaran;
                  } else {
                    // 2. Si no coincide el ID, iteramos los valores para comparar nombres normalizados
                    const filaEncontrada = Object.values(
                      recep.ucosAfectadas,
                    ).find((f) => {
                      return (
                        normalizarTexto(f.nombreUco) === bultoUcoNorm ||
                        normalizarTexto(f.idUco) === bultoUcoNorm
                      );
                    });

                    if (filaEncontrada && filaEncontrada.albaran) {
                      albaranEncontrado = filaEncontrada.albaran;
                    }
                  }
                }

                // Si tras la búsqueda sigue vacío o es un string sin rellenar, asignamos el marcador
                if (!albaranEncontrado || albaranEncontrado.trim() === "") {
                  albaranEncontrado = "S/A";
                }

                bolsaBultos.push({
                  ...bulto,
                  albaranAsociado: albaranEncontrado,
                });

                if (bulto.ucoAsignada) {
                  ucosUnicas.add(bulto.ucoAsignada);
                }
              }
            });
          }
        });

        setBultosTotales(bolsaBultos);
        setListaUcosFiltro(Array.from(ucosUnicas));
      }
    } catch (e) {
      Alert.alert("Error", "No se pudo leer el muelle de stock.");
    }
  };

  const aplicarLogicaFiltros = () => {
    let temporal = [...bultosTotales];

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

    setBultosFiltrados(temporal);
  };

  const procesarDisparoLaserStock = (codigoScaneado: string) => {
    const limpio = codigoScaneado.trim();
    if (!limpio) return;

    const bultoEncontrado = bultosTotales.find((b) => b.idBulto === limpio);
    if (!bultoEncontrado) {
      Alert.alert(
        "Código No Registrado",
        `El bulto con ID "${limpio}" no se encuentra en el muelle de stock.`,
      );
      return;
    }

    setBultoAEntregar(bultoEncontrado);
    setModalEntregaVisible(true);
  };

  const ejecutarEntregaBajaBulto = async () => {
    if (!bultoAEntregar) return;

    try {
      let recepcionOrigenId = "";
      const historicoActualizado = historicoRecepciones.map((recep) => {
        let contieneBulto = false;
        const nuevosBultos = recep.detalleBultos.map((b) => {
          if (b.idBulto === bultoAEntregar.idBulto) {
            contieneBulto = true;
            return { ...b, borrado: true, updatedAt: new Date().toISOString() };
          }
          return b;
        });

        if (contieneBulto) {
          recepcionOrigenId = recep.idRecepcion;
          return {
            ...recep,
            detalleBultos: nuevosBultos,
            updatedAt: new Date().toISOString(),
          };
        }
        return recep;
      });

      const ordenSalidaDevolucion = {
        idDevolucion: `SAL-${Date.now().toString().slice(-6)}`,
        fecha: new Date().toLocaleString("es-ES"),
        operario: operarioEntrega,
        updatedAt: new Date().toISOString(),
        tipoSalida: motivoEntregaSeleccionado,
        observaciones: obsEntrega || "Sin comentarios adicionales",
        recepcionOrigenRef: recepcionOrigenId,
        articulos: [
          {
            idBulto: bultoAEntregar.idBulto,
            numeroPedido: bultoAEntregar.numeroPedido,
            cip: bultoAEntregar.cip,
            propietario: bultoAEntregar.propietario,
            ucoAsignada: bultoAEntregar.ucoAsignada,
            motivo: motivoEntregaSeleccionado,
          },
        ],
      };

      const histDevRaw = await AsyncStorage.getItem("historico_devoluciones");
      const historialDevoluciones = histDevRaw ? JSON.parse(histDevRaw) : [];
      historialDevoluciones.push(ordenSalidaDevolucion);

      await AsyncStorage.setItem(
        "historico_recepciones",
        JSON.stringify(historicoActualizado),
      );
      await AsyncStorage.setItem(
        "historico_devoluciones",
        JSON.stringify(historialDevoluciones),
      );

      setModalEntregaVisible(false);
      setBultoAEntregar(null);
      setObsEntrega("");
      setMotivoEntregaSeleccionado("ENTREGA ORDINARIA (SERVICIO)");
      Alert.alert(
        "Entrega Consolidada",
        "El bulto ha sido rebajado de las existencias.",
      );

      await cargarStockMuelle();
      setTimeout(() => inputLaserMuelleRef.current?.focus(), 300);
    } catch (e) {
      Alert.alert("Error", "No se pudo procesar la rebaja de stock.");
    }
  };

  const alternarCamaraMuelle = async () => {
    if (!camaraMuelleActiva) {
      if (!permission?.granted) {
        const respuesta = await requestPermission();
        if (!respuesta.granted) {
          Alert.alert("Permiso Denegado", "Se requiere acceso a la cámara.");
          return;
        }
      }
      setCamaraMuelleActiva(true);
    } else {
      setCamaraMuelleActiva(false);
      setTimeout(() => inputLaserMuelleRef.current?.focus(), 200);
    }
  };

  return (
    <View style={styles.contenedorBase}>
      {/* CABECERA */}
      <View style={styles.cabecera}>
        <Text style={styles.tituloStock}>Pedidos en Muelle Operativo</Text>
        <Text style={styles.subtituloStock}>
          Stock actual en almacén unificado
        </Text>
      </View>

      <TextInput
        ref={inputLaserMuelleRef}
        style={styles.inputOcultoLaserStock}
        showSoftInputOnFocus={false}
        autoFocus={true}
        value={bufferLaserMuelle}
        onChangeText={(v) => {
          if (v.includes("\n") || v.length > 10) {
            procesarDisparoLaserStock(v.replace("\n", "").trim());
            setBufferLaserMuelle("");
          } else {
            setBufferLaserMuelle(v);
          }
        }}
      />

      <View style={styles.bannerLaserAviso}>
        <Text style={styles.txtBannerLaser}>
          Escáner Láser de Salidas Disponible. Dispárale a un bulto para
          despacharlo.
        </Text>
      </View>

      {camaraMuelleActiva && (
        <View style={styles.contenedorVisorCamara}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={({ data }) => {
              if (data) {
                setCamaraMuelleActiva(false);
                procesarDisparoLaserStock(data);
              }
            }}
          />
          <TouchableOpacity
            style={styles.btnCerrarCamaraFlotante}
            onPress={() => setCamaraMuelleActiva(false)}
          >
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>
              X Cerrar Cámara
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* BARRA DE BÚSQUEDA */}
      <View style={styles.zonaBuscador}>
        <TextInput
          style={styles.inputBuscador}
          placeholder="Buscar por ID Bulto, Pedido o CIP..."
          value={busquedaTexto}
          onChangeText={setBusquedaTexto}
        />
      </View>

      {/* SECTOR 1: FILTRO DE UCOs GENERALES */}
      <View style={{ marginTop: 10 }}>
        <Text style={styles.lblSeccionFiltro}>
          Filtrar por Unidad Destino (UCO):
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollFiltrosHorizontal}
        >
          <TouchableOpacity
            style={[
              styles.pildoraUco,
              ucoSeleccionada === "TODAS" && styles.pildoraUcoActiva,
            ]}
            onPress={() => setUcoSeleccionada("TODAS")}
          >
            <Text
              style={[
                styles.txtPildoraUco,
                ucoSeleccionada === "TODAS" && { color: "#fff" },
              ]}
            >
              🏢 Todas
            </Text>
          </TouchableOpacity>
          {listaUcosFiltro.map((uco) => (
            <TouchableOpacity
              key={uco}
              style={[
                styles.pildoraUco,
                ucoSeleccionada === uco && styles.pildoraUcoActiva,
              ]}
              onPress={() => setUcoSeleccionada(uco)}
            >
              <Text
                style={[
                  styles.txtPildoraUco,
                  ucoSeleccionada === uco && { color: "#fff" },
                ]}
              >
                {uco}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* SECTOR 2: PESTAÑAS DE ALBARÁN (Corregido y sincronizado) */}
      {ucoSeleccionada !== "TODAS" && listaAlbaranesDisponibles.length > 0 && (
        <View style={styles.zonaAlbaranesPestanas}>
          <Text style={styles.lblSeccionAlbaran}>
            Albaranes detectados en {ucoSeleccionada}:
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollFiltrosHorizontal}
          >
            <TouchableOpacity
              style={[
                styles.pestanaAlbaran,
                albaranSeleccionado === "TODOS" && styles.pestanaAlbaranActiva,
              ]}
              onPress={() => setAlbaranSeleccionado("TODOS")}
            >
              <Text
                style={[
                  styles.txtPestanaAlbaran,
                  albaranSeleccionado === "TODOS" && { color: "#fff" },
                ]}
              >
                📋 Ver Todos
              </Text>
            </TouchableOpacity>
            {listaAlbaranesDisponibles.map((alb) => (
              <TouchableOpacity
                key={alb}
                style={[
                  styles.pestanaAlbaran,
                  albaranSeleccionado === alb && styles.pestanaAlbaranActiva,
                ]}
                onPress={() => setAlbaranSeleccionado(alb)}
              >
                <Text
                  style={[
                    styles.txtPestanaAlbaran,
                    albaranSeleccionado === alb && { color: "#fff" },
                  ]}
                >
                  📄 {alb}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* LISTADO DE STOCK */}
      <ScrollView style={styles.contenedorScrollStock}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Text style={styles.txtConteoBultos}>
            Existencias en muelle: {bultosFiltrados.length} bultos
          </Text>
          <TouchableOpacity
            style={styles.btnEscanerFlotanteEntrega}
            onPress={alternarCamaraMuelle}
          >
            <Text
              style={{ fontSize: 12, fontWeight: "bold", color: "#2c3e50" }}
            >
              📷 Escáner Cámara
            </Text>
          </TouchableOpacity>
        </View>

        {bultosFiltrados.length === 0 ? (
          <Text style={styles.txtStockVacio}>
            No hay material cargado en este muelle con este filtro.
          </Text>
        ) : (
          bultosFiltrados.map((item) => (
            <TouchableOpacity
              key={item.idBulto}
              style={styles.tarjetaBultoStock}
              onPress={() => {
                setBultoAEntregar(item);
                setModalEntregaVisible(true);
              }}
            >
              <View style={styles.cabeceraTarjetaStock}>
                <Text style={styles.txtIdBultoStock}>
                  📦 ID Bulto: {item.idBulto}
                </Text>
                <View style={styles.tagAlbaranStock}>
                  <Text style={styles.txtTagAlbaran}>
                    ALB: {item.albaranAsociado}
                  </Text>
                </View>
              </View>
              <View style={styles.cuerpoTarjetaStock}>
                <Text style={styles.txtMetaStock}>
                  Orden/Pedido:{" "}
                  <Text style={{ fontWeight: "bold" }}>
                    {item.numeroPedido}
                  </Text>
                </Text>
                <Text style={styles.txtMetaStock}>
                  CIP: {item.cip} | Destino: {item.ucoAsignada}
                </Text>
                <Text style={styles.txtTitularStock}>
                  Titular/Destinatario:{" "}
                  {item.propietario || "Logística General"}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 30 }} />
      </ScrollView>

      {/* MODAL DE DESPACHO */}
      <Modal
        visible={modalEntregaVisible}
        animationType="fade"
        transparent={true}
      >
        <View style={styles.pantallaModalMuelle}>
          <View style={styles.cajaModalMuelle}>
            <Text style={styles.titModalMuelle}>
              Despachar Bulto de Almacén
            </Text>
            {bultoAEntregar && (
              <View style={styles.cajaInfoBultoMuelle}>
                <Text style={styles.txtDetalleMuelle}>
                  📦{" "}
                  <Text style={{ fontWeight: "bold" }}>
                    {bultoAEntregar.idBulto}
                  </Text>
                </Text>
                <Text style={styles.txtDetalleMuelle}>
                  Pedido: {bultoAEntregar.numeroPedido} | Albarán:{" "}
                  {bultoAEntregar.albaranAsociado}
                </Text>
                <Text style={styles.txtDetalleMuelle}>
                  Asignado a: {bultoAEntregar.ucoAsignada}
                </Text>
                <Text style={styles.txtDetalleMuelle}>
                  Titular: {bultoAEntregar.propietario}
                </Text>
              </View>
            )}

            <Text style={styles.lblModalMuelle}>
              Operario a cargo de la Rebaja
            </Text>
            <TextInput
              style={[styles.inputModalMuelle, { backgroundColor: "#eceff1" }]}
              value={operarioEntrega}
              editable={false}
            />

            <Text style={styles.lblModalMuelle}>
              Concepto / Canal de Salida
            </Text>
            <TouchableOpacity
              style={styles.comboSelectorModal}
              onPress={() => setMenuMotivosAbierto(!menuMotivosAbierto)}
            >
              <Text
                style={{ fontSize: 13, fontWeight: "600", color: "#2c3e50" }}
              >
                {motivoEntregaSeleccionado} 🔽
              </Text>
            </TouchableOpacity>

            {menuMotivosAbierto && (
              <View style={styles.contenedorItemsFlotantesModal}>
                {listaMotivosDisponibles.map((mot) => (
                  <TouchableOpacity
                    key={mot}
                    style={{
                      padding: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: "#f1f2f6",
                    }}
                    onPress={() => {
                      setMotivoEntregaSeleccionado(mot);
                      setMenuMotivosAbierto(false);
                    }}
                  >
                    <Text style={{ fontSize: 12, color: "#34495e" }}>
                      {mot}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.lblModalMuelle}>Observaciones</Text>
            <TextInput
              style={[
                styles.inputModalMuelle,
                { height: 60, textAlignVertical: "top" },
              ]}
              multiline={true}
              numberOfLines={3}
              placeholder="Ej: Entregado a la dotación..."
              value={obsEntrega}
              onChangeText={setObsEntrega}
            />

            <View style={styles.zonaBotonesModalMuelle}>
              <TouchableOpacity
                style={[
                  styles.btnModalMuelleBase,
                  { backgroundColor: "#e67e22" },
                ]}
                onPress={ejecutarEntregaBajaBulto}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "bold", fontSize: 13 }}
                >
                  Consolidar Salida 📦
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btnModalMuelleBase,
                  { backgroundColor: "#95a5a6" },
                ]}
                onPress={() => {
                  setModalEntregaVisible(false);
                  setBultoAEntregar(null);
                  setTimeout(() => inputLaserMuelleRef.current?.focus(), 200);
                }}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "bold", fontSize: 13 }}
                >
                  Cancelar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.barraAccionesInferior}>
        <TouchableOpacity
          style={styles.btnVolverMenu}
          onPress={() => router.replace("/menu")}
        >
          <Text style={styles.txtVolverMenu}>Volver al Panel Principal</Text>
        </TouchableOpacity>
      </View>
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
  tituloStock: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  subtituloStock: { fontSize: 12, color: "#e0dbcd", marginTop: 2 },
  zonaBuscador: { paddingHorizontal: 15, marginTop: 12 },
  inputBuscador: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: "#2c3e50",
  },
  lblSeccionFiltro: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#7f8c8d",
    marginHorizontal: 15,
    marginBottom: 5,
  },
  scrollFiltrosHorizontal: { paddingHorizontal: 15, gap: 8, paddingBottom: 5 },
  pildoraUco: {
    backgroundColor: "#fff",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  pildoraUcoActiva: { backgroundColor: "#79715B", borderColor: "#5c5645" },
  txtPildoraUco: { fontSize: 12, fontWeight: "bold", color: "#2c3e50" },

  zonaAlbaranesPestanas: {
    marginTop: 8,
    backgroundColor: "#e2e8f0",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#cbd5e1",
  },
  lblSeccionAlbaran: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#475569",
    marginHorizontal: 15,
    marginBottom: 4,
  },
  pestanaAlbaran: {
    backgroundColor: "#fff",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  pestanaAlbaranActiva: { backgroundColor: "#2980b9", borderColor: "#1f618d" },
  txtPestanaAlbaran: { fontSize: 11, fontWeight: "bold", color: "#475569" },

  contenedorScrollStock: { flex: 1, padding: 15 },
  txtConteoBultos: { fontSize: 12, color: "#7f8c8d", fontWeight: "bold" },
  txtStockVacio: {
    textAlign: "center",
    color: "#95a5a6",
    marginTop: 40,
    fontSize: 13,
  },
  tarjetaBultoStock: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    elevation: 2,
  },
  cabeceraTarjetaStock: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#f1f2f6",
    paddingBottom: 6,
  },
  txtIdBultoStock: { fontSize: 13, fontWeight: "bold", color: "#2c3e50" },
  tagAlbaranStock: {
    backgroundColor: "#e0f2fe",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  txtTagAlbaran: { fontSize: 10, fontWeight: "bold", color: "#0369a1" },
  cuerpoTarjetaStock: { marginTop: 6 },
  txtMetaStock: { fontSize: 12, color: "#34495e" },
  txtTitularStock: {
    fontSize: 11,
    color: "#7f8c8d",
    marginTop: 2,
    fontStyle: "italic",
  },
  barraAccionesInferior: {
    padding: 15,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#cbd5e1",
  },
  btnVolverMenu: {
    backgroundColor: "#34495e",
    padding: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  txtVolverMenu: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  inputOcultoLaserStock: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  bannerLaserAviso: {
    backgroundColor: "#e67e22",
    borderRadius: 6,
    padding: 8,
    marginHorizontal: 15,
    marginTop: 10,
  },
  txtBannerLaser: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 11,
    textAlign: "center",
  },
  btnEscanerFlotanteEntrega: {
    backgroundColor: "#e2e8f0",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  comboSelectorModal: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#dcdde1",
    borderRadius: 6,
    padding: 12,
    justifyContent: "center",
  },
  contenedorItemsFlotantesModal: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    marginTop: 2,
    maxHeight: 130,
    overflow: "scroll",
  },
  contenedorVisorCamara: {
    width: "100%",
    height: 180,
    backgroundColor: "#000",
    marginBottom: 10,
    position: "relative",
  },
  btnCerrarCamaraFlotante: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 6,
    borderRadius: 4,
  },
  pantallaModalMuelle: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  cajaModalMuelle: { backgroundColor: "#fff", borderRadius: 12, padding: 20 },
  titModalMuelle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 12,
  },
  cajaInfoBultoMuelle: {
    backgroundColor: "#f8f9fa",
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    marginBottom: 10,
  },
  txtDetalleMuelle: { fontSize: 12, color: "#2c3e50", marginBottom: 2 },
  lblModalMuelle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#7f8c8d",
    marginTop: 8,
    marginBottom: 4,
  },
  inputModalMuelle: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    padding: 10,
    fontSize: 13,
    color: "#2c3e50",
  },
  zonaBotonesModalMuelle: { flexDirection: "row", gap: 10, marginTop: 20 },
  btnModalMuelleBase: {
    flex: 1,
    padding: 12,
    borderRadius: 6,
    alignItems: "center",
  },
});
