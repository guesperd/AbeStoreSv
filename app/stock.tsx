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
  periodoRecepcion?: string; 
  ucosAfectadas: { [idUco: string]: FilaAlbaran };
  detalleBultos: BultoStock[];
}

export default function StockScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  // Estados de infraestructura
  const [tipoHardware, setTipoHardware] = useState<string>("android_camara");
  const [historicoRecepciones, setHistoricoRecepciones] = useState<RecepcionCerrada[]>([]);
  const [bultosTotales, setBultosTotales] = useState<BultoStock[]>([]);
  const [bultosFiltrados, setBultosFiltrados] = useState<BultoStock[]>([]);

  // Filtros laterales / superiores
  const [listaUcosUnicas, setListaUcosUnicas] = useState<string[]>([]);
  const [ucoSeleccionada, setUcoSeleccionada] = useState<string>("TODAS");
  const [busquedaTexto, setBusquedaTexto] = useState("");

  // Modales e Interfaz de Escaneo
  const [mostrandoCamara, setMostrandoCamara] = useState(false);
  const [modalEditarVisible, setModalEditarVisible] = useState(false);

  // Estados para Edición de Bulto
  const [bultoAEditar, setBultoAEditar] = useState<BultoStock | null>(null);
  const [editPedido, setEditPedido] = useState("");
  const [editCip, setEditCip] = useState("");
  const [editPropietario, setEditPropietario] = useState("");
  const [editUco, setEditUco] = useState("");

  // Control Escáner Láser Hardware (Skorpio X5)
  const [inputLaser, setInputLaser] = useState("");
  const inputLaserRef = useRef<TextInput>(null);

  useEffect(() => {
    cargarDatosInventario();
  }, []);

  useEffect(() => {
    filtrarInventarioLcal();
  }, [ucoSeleccionada, busquedaTexto, bultosTotales]);

  // Loop de auto-enfoque continuo para terminales láser físicos
  useEffect(() => {
    let intervaloEnfoque: NodeJS.Timeout;
    if (tipoHardware === "skorpio_laser" && !mostrandoCamara && !modalEditarVisible) {
      intervaloEnfoque = setInterval(() => {
        inputLaserRef.current?.focus();
      }, 300);
    }
    return () => {
      if (intervaloEnfoque) clearInterval(intervaloEnfoque);
    };
  }, [tipoHardware, mostrandoCamara, modalEditarVisible]);

  const cargarDatosInventario = async () => {
    try {
      const hw = await AsyncStorage.getItem("dispositivo_escaneo");
      setTipoHardware(hw || "android_camara");

      const histRaw = await AsyncStorage.getItem("historico_recepciones");
      if (histRaw) {
        const historico: RecepcionCerrada[] = JSON.parse(histRaw);
        setHistoricoRecepciones(historico);

        // Agrupar todos los bultos no borrados lógicamente en una única bolsa de stock
        const bolsaStock: BultoStock[] = [];
        const ucosSet = new Set<string>();

        historico.forEach((recep) => {
          if (recep.detalleBultos) {
            recep.detalleBultos.forEach((bulto) => {
              if (!bulto.borrado) {
                bolsaStock.push(bulto);
                if (bulto.ucoAsignada) ucosSet.add(bulto.ucoAsignada);
              }
            });
          }
        });

        setBultosTotales(bolsaStock);
        setListaUcosUnicas(Array.from(ucosSet));
      }
    } catch (e) {
      Alert.alert("Error", "No se pudo sincronizar el stock interno.");
    }
  };

  const filtrarInventarioLcal = () => {
    let temporal = [...bultosTotales];

    if (ucoSeleccionada !== "TODAS") {
      temporal = temporal.filter((b) => b.ucoAsignada === ucoSeleccionada);
    }

    if (busquedaTexto.trim() !== "") {
      const query = busquedaTexto.toLowerCase().trim();
      temporal = temporal.filter(
        (b) =>
          b.idBulto.toLowerCase().includes(query) ||
          b.numeroPedido.toLowerCase().includes(query) ||
          b.cip.toLowerCase().includes(query) ||
          b.propietario.toLowerCase().includes(query)
      );
    }

    setBultosFiltrados(temporal);
  };

  // --- ESCÁNER DE BÚSQUEDA RÁPIDA ---
  const ejecutarDisparoBuscador = (codigoLeido: string) => {
    const limpio = codigoLeido.trim().toUpperCase();
    if (!limpio) return;
    setBusquedaTexto(limpio);
  };

  // --- MODAL DE EDICIÓN ---
  const abrirEditorBulto = (bulto: BultoStock) => {
    setBultoAEditar(bulto);
    setEditPedido(bulto.numeroPedido);
    setEditCip(bulto.cip);
    setEditPropietario(bulto.propietario);
    setEditUco(bulto.ucoAsignada);
    setModalEditarVisible(true);
  };

  const guardarCambiosBulto = async () => {
    if (!bultoAEditar) return;

    try {
      const ahoraIso = new Date().toISOString();
      const historicoActualizado = historicoRecepciones.map((rec) => {
        let editado = false;
        const bultosModificados = rec.detalleBultos.map((b) => {
          if (b.idBulto === bultoAEditar.idBulto) {
            editado = true;
            return {
              ...b,
              numeroPedido: editPedido.trim().toUpperCase(),
              cip: editCip.trim().toUpperCase(),
              propietario: editPropietario.trim().toUpperCase(),
              ucoAsignada: editUco.trim().toUpperCase(),
              updatedAt: ahoraIso,
            };
          }
          return b;
        });
        return editado ? { ...rec, updatedAt: ahoraIso, detalleBultos: bultosModificados } : rec;
      });

      await AsyncStorage.setItem("historico_recepciones", JSON.stringify(historicoActualizado));
      setModalEditarVisible(false);
      setBultoAEditar(null);
      Alert.alert("Éxito", "Campos del bulto modificados correctamente.");
      await cargarDatosInventario();
    } catch (e) {
      Alert.alert("Error", "No se pudieron persistir los cambios.");
    }
  };

  // --- ACCIÓN DE ELIMINACIÓN PERMANENTE ---
  const eliminarBultoPermanente = (idBulto: string) => {
    Alert.alert(
      "Eliminar del Registro",
      `¿Seguro que deseas destruir permanentemente el bulto [${idBulto}] del inventario? Esta acción no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar Registro",
          style: "destructive",
          onPress: async () => {
            try {
              const ahoraIso = new Date().toISOString();
              // Modificación destructiva / filtrado total del bulto en el origen histórico
              const historicoActualizado = historicoRecepciones.map((rec) => {
                const bultosLimpios = rec.detalleBultos.filter((b) => b.idBulto !== idBulto);
                return { ...rec, updatedAt: ahoraIso, detalleBultos: bultosLimpios };
              });

              await AsyncStorage.setItem("historico_recepciones", JSON.stringify(historicoActualizado));
              Alert.alert("Baja Confirmada", "El bulto ha sido purgado de los registros.");
              await cargarDatosInventario();
            } catch (e) {
              Alert.alert("Error", "No se pudo purgar el registro.");
            }
          },
        },
      ]
    );
  };

  // --- CONTROL CÁMARA ANDROID ---
  const activarCamaraFiltro = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert("Permiso Denegado", "Se necesita acceso a la cámara.");
        return;
      }
    }
    setMostrandoCamara(true);
  };

  return (
    <View style={styles.contenedorBase}>
      {/* Input invisible para interceptar el lector láser físico de la Skorpio X5 */}
      {tipoHardware === "skorpio_laser" && !mostrandoCamara && !modalEditarVisible && (
        <TextInput
          ref={inputLaserRef}
          style={styles.inputOcultoLaser}
          showSoftInputOnFocus={false}
          autoFocus={true}
          value={inputLaser}
          onChangeText={(t) => {
            if (t.includes("\n") || t.length > 12) {
              ejecutarDisparoBuscador(t.replace("\n", "").trim());
              setInputLaser("");
            } else {
              setInputLaser(t);
            }
          }}
        />
      )}

      {/* CABECERA */}
      <View style={styles.cabecera}>
        <Text style={styles.tituloPantalla}>Inventario Real (Stock)</Text>
        <Text style={styles.subtituloMeta}>Consulta estructural y corrección de carga ({bultosTotales.length} bultos totales)</Text>
      </View>

      {/* BANNER INFORMATIVO HARDWARE LÁSER */}
      {tipoHardware === "skorpio_laser" && (
        <View style={styles.bannerLaserAviso}>
          <Text style={styles.txtBannerLaser}>📱 Modo Terminal Skorpio X5 Activo (Gatillo listo para buscar)</Text>
        </View>
      )}

      {/* FILTROS DE BÚSQUEDA */}
      <View style={styles.contenedorFiltros}>
        <Text style={styles.labelFiltro}>Filtrar por Unidad Organizada (UCO):</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollPildoras}>
          <TouchableOpacity
            style={[styles.pildora, ucoSeleccionada === "TODAS" && styles.pildoraActiva]}
            onPress={() => setUcoSeleccionada("TODAS")}
          >
            <Text style={[styles.txtPildora, ucoSeleccionada === "TODAS" && { color: "#fff" }]}>🏢 Todas</Text>
          </TouchableOpacity>
          {listaUcosUnicas.map((u) => (
            <TouchableOpacity
              key={u}
              style={[styles.pildora, ucoSeleccionada === u && styles.pildoraActiva]}
              onPress={() => setUcoSeleccionada(u)}
            >
              <Text style={[styles.txtPildora, ucoSeleccionada === u && { color: "#fff" }]}>{u}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.cajaBuscadorManual}>
          <TextInput
            style={styles.inputBusquedaManual}
            placeholder="🔍 Buscar por ID, Pedido, CIP o Titular..."
            placeholderTextColor="#94a3b8"
            value={busquedaTexto}
            onChangeText={setBusquedaTexto}
          />
          {tipoHardware === "android_camara" && (
            <TouchableOpacity style={styles.btnDisparoCamBuscador} onPress={activarCamaraFiltro}>
              <Text style={{ fontSize: 16 }}>📷</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* LISTADO DINÁMICO */}
      <ScrollView style={styles.scrollListado}>
        {bultosFiltrados.length === 0 ? (
          <Text style={styles.textoListaVacia}>No existen bultos disponibles en almacén con los filtros seleccionados.</Text>
        ) : (
          bultosFiltrados.map((item) => (
            <View key={item.idBulto} style={styles.tarjetaInventario}>
              <View style={{ flex: 1 }}>
                <Text style={styles.txtBultoId}>📦 Bulto ID: <Text style={{ fontWeight: "bold", color: "#2c3e50" }}>{item.idBulto}</Text></Text>
                <Text style={styles.txtBultoSub}>Pedido: <Text style={{ fontWeight: "700" }}>{item.numeroPedido}</Text> | CIP: {item.cip}</Text>
                <Text style={styles.txtBultoSub}>UCO Destino: <Text style={{ fontWeight: "700", color: "#79715B" }}>{item.ucoAsignada}</Text></Text>
                <Text style={styles.txtBultoTitular}>Titular militar: {item.propietario || "Logística General"}</Text>
              </View>

              {/* COLUNA DE ACCIONES (EDITAR Y PURGAR) */}
              <View style={styles.columnaAccionesTarjeta}>
                <TouchableOpacity style={styles.btnAccionTarjetaEditar} onPress={() => abrirEditorBulto(item)}>
                  <Text style={styles.txtAccionBtn}>✏️ Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnAccionTarjetaEliminar} onPress={() => eliminarBultoPermanente(item.idBulto)}>
                  <Text style={styles.txtAccionBtn}>🗑️ Borrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* MODAL: EDICIÓN INTEGRAL DE CAMPOS DEL BULTO */}
      <Modal visible={modalEditarVisible} animationType="slide" transparent>
        <View style={styles.fondoOpacoModal}>
          <View style={styles.cajaBlancaModal}>
            <Text style={styles.modalTitulo}>Modificar Datos del Bulto</Text>
            {bultoAEditar && (
              <Text style={styles.modalSubId}>Corrigiendo registro: <Text style={{ fontWeight: "bold" }}>{bultoAEditar.idBulto}</Text></Text>
            )}

            <Text style={styles.labelFiltro}>Número de Pedido/Referencia:</Text>
            <TextInput style={styles.inputModalForm} value={editPedido} onChangeText={setEditPedido} autoCapitalize="characters" />

            <Text style={styles.labelFiltro}>CIP Militar:</Text>
            <TextInput style={styles.inputModalForm} value={editCip} onChangeText={setEditCip} autoCapitalize="characters" />

            <Text style={styles.labelFiltro}>Titular Asignado (Dueño):</Text>
            <TextInput style={styles.inputModalForm} value={editPropietario} onChangeText={setEditPropietario} autoCapitalize="characters" />

            <Text style={styles.labelFiltro}>UCO Destino:</Text>
            <TextInput style={styles.inputModalForm} value={editUco} onChangeText={setEditUco} autoCapitalize="characters" />

            <View style={styles.botonesModalFila}>
              <TouchableOpacity style={[styles.btnModalBase, { backgroundColor: "#bdc3c7" }]} onPress={() => setModalEditarVisible(false)}>
                <Text style={{ fontWeight: "bold", color: "#2c3e50" }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnModalBase, { backgroundColor: "#79715B" }]} onPress={guardarCambiosBulto}>
                <Text style={{ fontWeight: "bold", color: "#fff" }}>Guardar Cambios</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: ESCÁNER POR CÁMARA (FILTRO ANDROID) */}
      <Modal visible={mostrandoCamara} animationType="fade">
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={({ data }) => {
              if (data) {
                ejecutarDisparoBuscador(data);
                setMostrandoCamara(false);
              }
            }}
          />
          <View style={styles.overlayControlesCamara}>
            <Text style={styles.txtGuiaCamara}>Apunta al código para autocompletar el buscador</Text>
            <TouchableOpacity style={styles.btnCerrarCamaraFlotante} onPress={() => setMostrandoCamara(false)}>
              <Text style={{ color: "#fff", fontWeight: "bold" }}>Cerrar Escáner</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* BARRA INFERIOR DE ACCIÓN */}
      <View style={styles.barraAccionesInferior}>
        <TouchableOpacity style={styles.btnVolverMenu} onPress={() => router.replace("/menu")}>
          <Text style={styles.txtVolverMenu}>Volver al Menú Principal</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedorBase: { flex: 1, backgroundColor: "#f5f6fa" },
  cabecera: { backgroundColor: "#79715B", paddingTop: 50, paddingBottom: 15, paddingHorizontal: 15 },
  tituloPantalla: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  subtituloMeta: { fontSize: 12, color: "#e0dbcd", marginTop: 2 },
  
  bannerLaserAviso: { backgroundColor: "#e67e22", padding: 8, marginBottom: 4 },
  txtBannerLaser: { color: "#fff", fontWeight: "bold", fontSize: 11, textAlign: "center" },
  inputOcultoLaser: { position: "absolute", width: 1, height: 1, opacity: 0 },

  contenedorFiltros: { backgroundColor: "#fff", padding: 12, borderBottomWidth: 1, borderColor: "#cbd5e1" },
  labelFiltro: { fontSize: 12, fontWeight: "600", color: "#7f8c8d", marginBottom: 5 },
  scrollPildoras: { gap: 6, paddingBottom: 10 },
  pildora: { backgroundColor: "#f1f2f6", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: "#cbd5e1" },
  pildoraActiva: { backgroundColor: "#79715B", borderColor: "#5c5645" },
  txtPildora: { fontSize: 11, fontWeight: "bold", color: "#2c3e50" },

  cajaBuscadorManual: { flexDirection: "row", gap: 8, marginTop: 4 },
  inputBusquedaManual: { flex: 1, backgroundColor: "#f8f9fa", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 6, padding: 10, fontSize: 13, color: "#2c3e50" },
  btnDisparoCamBuscador: { backgroundColor: "#e2e8f0", borderWidth: 1, borderColor: "#cbd5e1", paddingHorizontal: 12, justifyContent: "center", borderRadius: 6 },

  scrollListado: { flex: 1, paddingHorizontal: 12, paddingTop: 10 },
  textoListaVacia: { fontSize: 12, color: "#95a5a6", textAlign: "center", marginTop: 30, paddingHorizontal: 20 },
  tarjetaInventario: { backgroundColor: "#fff", padding: 12, borderRadius: 8, borderWidth: 1, borderColor: "#cbd5e1", marginBottom: 10, flexDirection: "row", alignItems: "center", elevation: 1 },
  txtBultoId: { fontSize: 13, color: "#475569" },
  txtBultoSub: { fontSize: 12, color: "#57606f", marginTop: 2 },
  txtBultoTitular: { fontSize: 11, color: "#7f8c8d", marginTop: 1, fontStyle: "italic" },

  columnaAccionesTarjeta: { gap: 6, marginLeft: 10, justifyContent: "center" },
  btnAccionTarjetaEditar: { backgroundColor: "#f39c12", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 4, alignItems: "center" },
  btnAccionTarjetaEliminar: { backgroundColor: "#c0392b", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 4, alignItems: "center" },
  txtAccionBtn: { color: "#fff", fontSize: 11, fontWeight: "bold" },

  fondoOpacoModal: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  cajaBlancaModal: { backgroundColor: "#fff", borderRadius: 12, padding: 20 },
  modalTitulo: { fontSize: 16, fontWeight: "bold", color: "#2c3e50", textAlign: "center" },
  modalSubId: { fontSize: 12, color: "#7f8c8d", textAlign: "center", marginBottom: 15, marginTop: 2 },
  inputModalForm: { backgroundColor: "#f8f9fa", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 6, padding: 10, fontSize: 13, color: "#2c3e50", marginBottom: 12 },
  botonesModalFila: { flexDirection: "row", gap: 10, marginTop: 10 },
  btnModalBase: { flex: 1, paddingVertical: 12, borderRadius: 6, alignItems: "center" },

  overlayControlesCamara: { position: "absolute", bottom: 40, left: 20, right: 20, alignItems: "center" },
  txtGuiaCamara: { color: "#fff", backgroundColor: "rgba(0,0,0,0.6)", padding: 8, borderRadius: 4, fontSize: 12, marginBottom: 15, textAlign: "center" },
  btnCerrarCamaraFlotante: { backgroundColor: "#c0392b", paddingVertical: 12, paddingHorizontal: 25, borderRadius: 6 },

  barraAccionesInferior: { backgroundColor: "#fff", borderTopWidth: 1, borderColor: "#cbd5e1", padding: 12 },
  btnVolverMenu: { backgroundColor: "#2c3e50", paddingVertical: 12, borderRadius: 6, alignItems: "center" },
  txtVolverMenu: { color: "#fff", fontWeight: "bold", fontSize: 14 },
});