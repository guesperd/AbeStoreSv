import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

// 🌟 Estructura unificada para manejar registros con marcas de tiempo y borrado lógico
interface UcoDestino {
  id: string;
  nombre: string;
  updatedAt: string;
  borrado?: boolean; // Campo clave para propagar bajas en la red P2P offline
}

export default function GestionAlmacenScreen() {
  const router = useRouter();

  // Estados de rol y sesión
  const [usuarioActual, setUsuarioActual] = useState("");
  const [rolUsuarioActual, setRolUsuarioActual] = useState("");

  // Estados del almacén (Objetos con metadatos de sincronización)
  const [ucoReceptora, setUcoReceptora] = useState("");
  const [ucoReceptoraTimestamp, setUcoReceptoraTimestamp] = useState("");
  const [listaUcos, setListaUcos] = useState<UcoDestino[]>([]);

  // Input para nueva UCO de destino
  const [nuevaUcoDestino, setNuevaUcoDestino] = useState("");

  useEffect(() => {
    cargarDatosAlmacen();
  }, []);

  const cargarDatosAlmacen = async () => {
    try {
      // 1. Cargar datos del usuario para comprobar permisos
      const sesionActiva = await AsyncStorage.getItem("usuario_activo");
      const datosUsuariosLocales = await AsyncStorage.getItem("lista_usuarios");

      if (sesionActiva !== null) {
        setUsuarioActual(sesionActiva);
        if (datosUsuariosLocales !== null) {
          const usuarios = JSON.parse(datosUsuariosLocales);
          const yo = usuarios.find(
            (u: any) => u.nombre.toLowerCase() === sesionActiva.toLowerCase(),
          );
          if (yo) setRolUsuarioActual(yo.rol);
        }
      }

      // 2. Cargar UCO Receptora Principal (Soporta migración de texto plano a JSON estructurado)
      const ucoGuardadaRaw = await AsyncStorage.getItem("uco_receptora");
      if (ucoGuardadaRaw !== null) {
        try {
          const objetoUco = JSON.parse(ucoGuardadaRaw);
          if (objetoUco && objetoUco.nombre) {
            setUcoReceptora(objetoUco.nombre);
            setUcoReceptoraTimestamp(objetoUco.updatedAt);
          } else {
            throw new Error("Formato antiguo");
          }
        } catch (e) {
          // Migración transparente si venía de un string plano anterior
          setUcoReceptora(ucoGuardadaRaw);
          setUcoReceptoraTimestamp(new Date().toISOString());
        }
      }

      // 3. Cargar listado de UCOs de destino normalizado
      const listaGuardadaRaw = await AsyncStorage.getItem("lista_ucos");
      if (listaGuardadaRaw !== null) {
        const listaParsed = JSON.parse(listaGuardadaRaw);

        // Normalizamos la estructura por si existen registros antiguos en memoria
        const listaNormalizada: UcoDestino[] = listaParsed.map((item: any) => {
          if (typeof item === "string") {
            return {
              id: item.replace(/\s+/g, "_").toLowerCase(),
              nombre: item,
              updatedAt: new Date().toISOString(),
              borrado: false,
            };
          }
          return {
            ...item,
            borrado: item.borrado || false,
          };
        });

        setListaUcos(listaNormalizada);
      }
    } catch (error) {
      Alert.alert("Error", "No se pudieron cargar los parámetros de almacén.");
    }
  };

  // GUARDAR UCO RECEPTORA PRINCIPAL (Sincronizable por timestamp)
  const guardarUcoReceptora = async () => {
    if (rolUsuarioActual !== "Administrador") {
      Alert.alert(
        "Acción Denegada",
        "Solo los Administradores pueden modificar la UCO Receptora Principal.",
      );
      return;
    }

    if (ucoReceptora.trim() === "") {
      Alert.alert(
        "Error",
        "El nombre de la UCO Receptora no puede estar vacío.",
      );
      return;
    }

    const isoTimestamp = new Date().toISOString();
    const estructuraUco = {
      nombre: ucoReceptora.trim(),
      updatedAt: isoTimestamp,
    };

    try {
      await AsyncStorage.setItem(
        "uco_receptora",
        JSON.stringify(estructuraUco),
      );
      await AsyncStorage.setItem("configuracion_almacen", "CONFIGURADO_OK");
      setUcoReceptoraTimestamp(isoTimestamp);

      Alert.alert(
        "Éxito",
        `UCO Receptora guardada como: ${estructuraUco.nombre}. Marca temporal registrada.`,
      );
    } catch (error) {
      Alert.alert("Error", "No se pudo guardar la UCO Receptora.");
    }
  };

  // AÑADIR UCO DE DESTINO (Alta con Timestamp)
  const añadirUcoDestino = async () => {
    if (rolUsuarioActual !== "Administrador" && rolUsuarioActual !== "Gestor") {
      Alert.alert(
        "Acción Denegada",
        "Solo los Administradores o Gestores pueden añadir UCOs de categorización.",
      );
      return;
    }

    if (nuevaUcoDestino.trim() === "") {
      Alert.alert("Error", "El campo no puede estar vacío.");
      return;
    }

    const ucoLimpia = nuevaUcoDestino.trim().toUpperCase();

    // Verificación de duplicados (Ignorando los que ya están borrados)
    const existe = listaUcos.some((u) => u.nombre === ucoLimpia && !u.borrado);
    if (existe) {
      Alert.alert("Aviso", "Esta UCO ya está registrada en el listado.");
      return;
    }

    const nuevaUco: UcoDestino = {
      id: ucoLimpia.replace(/\s+/g, "_").toLowerCase(),
      nombre: ucoLimpia,
      updatedAt: new Date().toISOString(),
      borrado: false,
    };

    try {
      const nuevaLista = [...listaUcos, nuevaUco];
      await AsyncStorage.setItem("lista_ucos", JSON.stringify(nuevaLista));
      setListaUcos(nuevaLista);
      setNuevaUcoDestino("");
      Alert.alert(
        "UCO Registrada",
        `Se ha añadido "${ucoLimpia}" para la clasificación de paquetes.`,
      );
    } catch (error) {
      Alert.alert("Error", "No se pudo guardar la nueva UCO.");
    }
  };

  // ELIMINAR UCO DE DESTINO (🌟 Cambiado a Borrado Lógico con Timestamp)
  const eliminarUcoDestino = async (
    idUcoParaBorrar: string,
    nombreUco: string,
  ) => {
    if (rolUsuarioActual !== "Administrador") {
      Alert.alert(
        "Acción Denegada",
        "Solo los Administradores pueden eliminar UCOs del listado.",
      );
      return;
    }

    Alert.alert(
      "Eliminar Clasificación",
      `¿Seguro que quieres eliminar la UCO ${nombreUco}? Los paquetes ya no podrán etiquetarse bajo esta unidad.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            // Mapeamos el array para marcar el elemento como borrado con un nuevo timestamp
            const nuevaLista = listaUcos.map((u) => {
              if (u.id === idUcoParaBorrar) {
                return {
                  ...u,
                  borrado: true,
                  updatedAt: new Date().toISOString(),
                };
              }
              return u;
            });

            await AsyncStorage.setItem(
              "lista_ucos",
              JSON.stringify(nuevaLista),
            );
            setListaUcos(nuevaLista);
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.contenedor}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={{ marginBottom: 15 }}
      >
        <Text style={{ color: "#3498db", fontWeight: "bold", fontSize: 16 }}>
          ⬅ Volver a Ajustes
        </Text>
      </TouchableOpacity>

      <Text style={styles.tituloPantalla}>Gestión de Almacén</Text>

      {/* BLOQUE 1: UCO RECEPTORA PRINCIPAL */}
      <View style={styles.seccionCard}>
        <Text style={styles.tituloSeccion}>UCO Receptora Principal</Text>
        <Text style={styles.descripcionFija}>
          Define el nombre del acuartelamiento o base que gestiona este
          dispositivo. Aparecerá en las cabeceras del menú y login.
        </Text>

        <TextInput
          style={[
            styles.input,
            rolUsuarioActual !== "Administrador" && styles.inputBloqueado,
          ]}
          placeholder="Ej: USAC San Cristóbal, ACAR Getafe..."
          value={ucoReceptora}
          onChangeText={setUcoReceptora}
          editable={rolUsuarioActual === "Administrador"}
        />

        {ucoReceptoraTimestamp !== "" && (
          <Text style={styles.timestampEstampa}>
            Último cambio:{" "}
            {new Date(ucoReceptoraTimestamp).toLocaleDateString()}{" "}
            {new Date(ucoReceptoraTimestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        )}

        {rolUsuarioActual === "Administrador" ? (
          <TouchableOpacity
            style={styles.botonPrimario}
            onPress={guardarUcoReceptora}
          >
            <Text style={styles.textoBoton}>Establecer Sede de Almacén</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.textoAvisoPermisos}>
            🔒 Solo el Administrador puede cambiar la sede principal.
          </Text>
        )}
      </View>

      {/* BLOQUE 2: AÑADIR UCOS PARA CATEGORIZACIÓN */}
      {rolUsuarioActual === "Administrador" || rolUsuarioActual === "Gestor" ? (
        <View style={styles.seccionCard}>
          <Text style={styles.tituloSeccion}>Asignar Nueva UCO de Destino</Text>
          <Text style={styles.descripcionFija}>
            Para poder categorizar los pedidos según su UCO correspondiente y
            facilitando el orden en recepciones/devoluciones.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: REGIMIENTO TRANSMISIONES 22, BCG..."
            value={nuevaUcoDestino}
            onChangeText={setNuevaUcoDestino}
            autoCapitalize="characters"
          />
          <TouchableOpacity
            style={[styles.botonPrimario, { backgroundColor: "#2ecc71" }]}
            onPress={añadirUcoDestino}
          >
            <Text style={styles.textoBoton}>Dar de Alta UCO de Destino</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.seccionCard}>
          <Text style={styles.textoAvisoPermisos}>
            🔒 No tienes rango de Gestor o Administrador para dar de alta
            unidades de reparto.
          </Text>
        </View>
      )}

      {/* BLOQUE 3: LISTADO DE UCOS (Filtrando bajas lógicas) */}
      <View style={[styles.seccionCard, { marginBottom: 60 }]}>
        <Text style={styles.tituloSeccion}>
          Listado de UCOs de Distribución
        </Text>

        {/* 🌟 Filtramos dinámicamente para que no se rendericen los borrados */}
        {listaUcos.filter((uco) => !uco.borrado).length === 0 ? (
          <Text style={styles.textoVacio}>
            No hay unidades de destino registradas todavía.
          </Text>
        ) : (
          listaUcos
            .filter((uco) => !uco.borrado)
            .map((uco, index) => (
              <View key={uco.id || index} style={styles.filaUco}>
                <View style={styles.bloqueInfoUco}>
                  <Text style={styles.nombreUcoLista}>🏢 {uco.nombre}</Text>
                  <Text style={styles.subtextUco}>
                    Sinc: {new Date(uco.updatedAt).toLocaleDateString()}{" "}
                    {new Date(uco.updatedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>

                {rolUsuarioActual === "Administrador" && (
                  <TouchableOpacity
                    style={styles.botonBorrar}
                    onPress={() => eliminarUcoDestino(uco.id, uco.nombre)}
                  >
                    <Text style={styles.textoBotonMini}>❌ Borrar</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: "#f5f6fa",
    padding: 20,
    paddingTop: 50,
  },
  tituloPantalla: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#2c3e50",
    marginBottom: 20,
  },
  seccionCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e1e1e1",
  },
  tituloSeccion: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#34495e",
    marginBottom: 6,
    borderBottomWidth: 1,
    borderColor: "#f1f2f6",
    paddingBottom: 5,
  },
  descripcionFija: {
    fontSize: 12,
    color: "#7f8c8d",
    marginBottom: 12,
    lineHeight: 16,
  },
  input: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#dcdde1",
    borderRadius: 6,
    padding: 10,
    fontSize: 15,
    marginBottom: 12,
    color: "#2c3e50",
  },
  inputBloqueado: { backgroundColor: "#e9ecef", color: "#6c757d" },
  botonPrimario: {
    backgroundColor: "#2c3e50",
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  textoBoton: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  textoAvisoPermisos: {
    fontSize: 12,
    color: "#e74c3c",
    textAlign: "center",
    fontWeight: "bold",
    paddingVertical: 5,
  },
  textoVacio: {
    fontSize: 13,
    color: "#95a5a6",
    textAlign: "center",
    paddingVertical: 15,
  },
  filaUco: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#f1f2f6",
  },
  bloqueInfoUco: { flex: 1 },
  nombreUcoLista: { fontSize: 15, fontWeight: "bold", color: "#2c3e50" },
  subtextUco: {
    fontSize: 10,
    color: "#95a5a6",
    marginTop: 2,
    fontStyle: "italic",
  },
  timestampEstampa: {
    fontSize: 11,
    color: "#7f8c8d",
    fontStyle: "italic",
    marginBottom: 10,
    textAlign: "right",
  },
  botonBorrar: {
    backgroundColor: "#e74c3c",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  textoBotonMini: { color: "#fff", fontSize: 11, fontWeight: "bold" },
});
