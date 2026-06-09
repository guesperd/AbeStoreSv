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

// 🌟 Interfaz actualizada para soportar Marcas de Tiempo y Borrado Lógico
interface Usuario {
  nombre: string;
  contrasena: string;
  rol: string;
  updatedAt: string;
  borrado?: boolean; // Campo clave para evitar registros fantasmas en P2P
}

export default function AdminUsuariosScreen() {
  const router = useRouter();

  // Estados de la pantalla
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuarioActual, setUsuarioActual] = useState("");
  const [rolUsuarioActual, setRolUsuarioActual] = useState("");

  // Estados para cambiar contraseña propia (Doble campo)
  const [nuevaContrasena, setNuevaContrasena] = useState("");
  const [confirmarContrasena, setConfirmarContrasena] = useState("");

  // Estados para la creación del nuevo usuario
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoRol, setNuevoRol] = useState("Almacenista");

  useEffect(() => {
    cargarDatosIniciales();
  }, []);

  const cargarDatosIniciales = async () => {
    try {
      const datosLocales = await AsyncStorage.getItem("lista_usuarios");
      let listaNormalizada: Usuario[] = [];

      if (datosLocales !== null) {
        const lista = JSON.parse(datosLocales);

        // Normalización: asegura marcas de tiempo y compatibilidad con datos viejos
        listaNormalizada = lista.map((u: any) => ({
          nombre: u.nombre,
          contrasena: u.contrasena,
          rol: u.rol || "Administrador",
          updatedAt: u.updatedAt || new Date().toISOString(),
          borrado: u.borrado || false,
        }));
        setUsuarios(listaNormalizada);
      }

      const sesionActiva = await AsyncStorage.getItem("usuario_activo");
      if (sesionActiva !== null) {
        setUsuarioActual(sesionActiva);

        const datosYo = listaNormalizada.find(
          (u) => u.nombre.toLowerCase() === sesionActiva.toLowerCase(),
        );
        if (datosYo) {
          setRolUsuarioActual(datosYo.rol);
        }
      }
    } catch (error) {
      Alert.alert("Error", "No se pudieron cargar los usuarios.");
    }
  };

  // CAMBIAR MI PROPIA CONTRASEÑA (Modificación con Timestamp)
  const cambiarMiContrasena = async () => {
    if (nuevaContrasena.trim() === "" || confirmarContrasena.trim() === "") {
      Alert.alert("Error", "Por favor, rellena ambos campos de contraseña.");
      return;
    }

    if (nuevaContrasena !== confirmarContrasena) {
      Alert.alert(
        "Error",
        "Las contraseñas introducidas no coinciden. Verifícalas.",
      );
      return;
    }

    try {
      const listaActualizada = usuarios.map((u) => {
        if (u.nombre.toLowerCase() === usuarioActual.toLowerCase()) {
          return {
            ...u,
            contrasena: nuevaContrasena,
            updatedAt: new Date().toISOString(),
          };
        }
        return u;
      });

      await AsyncStorage.setItem(
        "lista_usuarios",
        JSON.stringify(listaActualizada),
      );
      setUsuarios(listaActualizada);

      setNuevaContrasena("");
      setConfirmarContrasena("");
      Alert.alert("Éxito", "Tu contraseña se ha actualizado correctamente.");
    } catch (error) {
      Alert.alert("Error", "No se pudo actualizar la contraseña.");
    }
  };

  // CREAR NUEVA CUENTA (Alta con Timestamp)
  const crearUsuario = async () => {
    if (rolUsuarioActual !== "Administrador") {
      Alert.alert(
        "Acción Denegada",
        "Solo los administradores pueden crear usuarios.",
      );
      return;
    }

    if (nuevoNombre.trim() === "") {
      Alert.alert("Error", "El nombre de usuario no puede estar vacío.");
      return;
    }
    const existe = usuarios.some(
      (u) =>
        u.nombre.toLowerCase() === nuevoNombre.trim().toLowerCase() &&
        !u.borrado,
    );
    if (existe) {
      Alert.alert("Error", "Ese nombre de usuario ya está registrado.");
      return;
    }

    const nuevo: Usuario = {
      nombre: nuevoNombre.trim(),
      contrasena: "1234",
      rol: nuevoRol,
      updatedAt: new Date().toISOString(),
      borrado: false,
    };

    try {
      const listaActualizada = [...usuarios, nuevo];
      await AsyncStorage.setItem(
        "lista_usuarios",
        JSON.stringify(listaActualizada),
      );
      setUsuarios(listaActualizada);
      setNuevoNombre("");
      Alert.alert(
        "Usuario Creado",
        `Usuario '${nuevo.nombre}' creado con clave genérica 1234.`,
      );
    } catch (error) {
      Alert.alert("Error", "No se pudo guardar el nuevo usuario.");
    }
  };

  // CAMBIAR ROL DE OTRA CUENTA (Modificación con Timestamp - Corregido 🛠️)
  const cambiarRolAUser = async (
    nombreUsuario: string,
    nuevoRolAsignado: string,
  ) => {
    if (rolUsuarioActual !== "Administrador") {
      Alert.alert(
        "Acción Denegada",
        "No tienes permisos para modificar roles.",
      );
      return;
    }

    if (nombreUsuario.toLowerCase() === usuarioActual.toLowerCase()) {
      Alert.alert(
        "Acción Bloqueada",
        "Por motivos de seguridad, no puedes alterar el rol de tu propia cuenta en uso.",
      );
      return;
    }

    try {
      const listaActualizada = usuarios.map((u) => {
        if (u.nombre === nombreUsuario) {
          return {
            ...u,
            rol: nuevoRolAsignado, // 🌟 Asignación limpia corregida aquí
            updatedAt: new Date().toISOString(),
          };
        }
        return u;
      });

      await AsyncStorage.setItem(
        "lista_usuarios",
        JSON.stringify(listaActualizada),
      );
      setUsuarios(listaActualizada);

      Alert.alert(
        "Rol Actualizado",
        `El usuario "${nombreUsuario}" ahora es ${nuevoRolAsignado}.`,
      );
    } catch (error) {
      Alert.alert("Error", "No se pudo actualizar el rol.");
    }
  };

  // RESETEAR CONTRASEÑA AJENA (Modificación con Timestamp)
  const resetearContrasena = async (nombreUsuario: string) => {
    if (rolUsuarioActual !== "Administrador") {
      Alert.alert(
        "Acción Denegada",
        "Solo los administradores pueden resetear contraseñas.",
      );
      return;
    }

    Alert.alert(
      "Confirmar Reset",
      `¿Seguro que quieres restablecer la clave de ${nombreUsuario} a "1234"?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Resetear",
          style: "destructive",
          onPress: async () => {
            const listaActualizada = usuarios.map((u) => {
              if (u.nombre === nombreUsuario) {
                return {
                  ...u,
                  contrasena: "1234",
                  updatedAt: new Date().toISOString(),
                };
              }
              return u;
            });
            await AsyncStorage.setItem(
              "lista_usuarios",
              JSON.stringify(listaActualizada),
            );
            setUsuarios(listaActualizada);
            Alert.alert("Contraseña Reseteada", `La clave ahora es 1234.`);
          },
        },
      ],
    );
  };

  // ELIMINAR CUENTA DE OPERARIO (🌟 Cambiado a Borrado Lógico con Timestamp)
  const eliminarUsuario = async (nombreUsuario: string) => {
    if (rolUsuarioActual !== "Administrador") {
      Alert.alert(
        "Acción Denegada",
        "Solo los administradores pueden eliminar cuentas.",
      );
      return;
    }

    if (nombreUsuario.toLowerCase() === usuarioActual.toLowerCase()) {
      Alert.alert(
        "Acción Bloqueada",
        "No puedes eliminar tu propia cuenta en uso.",
      );
      return;
    }

    Alert.alert(
      "Eliminar Cuenta",
      `¿Estás seguro de que quieres eliminar al usuario ${nombreUsuario}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            // Buscamos el registro y le aplicamos borrado: true y marca de tiempo fresca
            const listaActualizada = usuarios.map((u) => {
              if (u.nombre === nombreUsuario) {
                return {
                  ...u,
                  borrado: true,
                  updatedAt: new Date().toISOString(),
                };
              }
              return u;
            });

            await AsyncStorage.setItem(
              "lista_usuarios",
              JSON.stringify(listaActualizada),
            );
            setUsuarios(listaActualizada);
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

      <Text style={styles.tituloPantalla}>Gestión de Usuarios</Text>

      {/* BLOQUE A: CAMBIAR MI PROPIA CONTRASEÑA */}
      <View style={styles.seccionCard}>
        <Text style={styles.tituloSeccion}>
          Mi Cuenta ({usuarioActual} - Rango: {rolUsuarioActual})
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Nueva contraseña propia"
          value={nuevaContrasena}
          onChangeText={setNuevaContrasena}
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          placeholder="Repite la nueva contraseña"
          value={confirmarContrasena}
          onChangeText={setConfirmarContrasena}
          secureTextEntry
        />
        <TouchableOpacity
          style={styles.botonPrimario}
          onPress={cambiarMiContrasena}
        >
          <Text style={styles.textoBoton}>Actualizar Mi Contraseña</Text>
        </TouchableOpacity>
      </View>

      {/* BLOQUE B: CREAR NUEVO USUARIO CON ROL */}
      {rolUsuarioActual === "Administrador" && (
        <View style={styles.seccionCard}>
          <Text style={styles.tituloSeccion}>Registrar Nuevo Operario</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre del operario"
            value={nuevoNombre}
            onChangeText={setNuevoNombre}
            autoCapitalize="none"
          />

          <Text style={styles.etiqueta}>Selecciona el Rol Inicial:</Text>
          <View style={styles.contenedorRoles}>
            {["Administrador", "Gestor", "Almacenista"].map((rol) => (
              <TouchableOpacity
                key={rol}
                style={[
                  styles.botonRol,
                  nuevoRol === rol && styles.botonRolActivo,
                ]}
                onPress={() => setNuevoRol(rol)}
              >
                <Text
                  style={[
                    styles.textoRol,
                    nuevoRol === rol && styles.textoRolActivo,
                  ]}
                >
                  {rol}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.botonPrimario, { backgroundColor: "#2ecc71" }]}
            onPress={crearUsuario}
          >
            <Text style={styles.textoBoton}>Dar de Alta (Clave: 1234)</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* BLOQUE C: LISTADO COMPLETO Y ACCIONES (Filtrando bajas lógicas) */}
      <View style={[styles.seccionCard, { marginBottom: 60 }]}>
        <Text style={styles.tituloSeccion}>Cuentas en este Dispositivo</Text>

        {/* 🌟 Filtrado dinámico antes del map para ocultar registros borrados */}
        {usuarios
          .filter((u) => !u.borrado)
          .map((item, index) => (
            <View key={index} style={styles.tarjetaUsuarioLista}>
              <View style={styles.infoUsuario}>
                <Text style={styles.nombreUser}>{item.nombre}</Text>
                <Text style={styles.rolUserText}>
                  Rol actual:{" "}
                  <Text style={{ fontWeight: "bold", color: "#2c3e50" }}>
                    {item.rol}
                  </Text>
                </Text>

                <Text
                  style={{ fontSize: 9, color: "#bdc3c7", fontStyle: "italic" }}
                >
                  Sinc: {new Date(item.updatedAt).toLocaleDateString()}{" "}
                  {new Date(item.updatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>

                {rolUsuarioActual === "Administrador" && (
                  <View style={styles.zonaCambioRolRapido}>
                    {["Admin", "Gestor", "Almacen"].map((rAbv) => {
                      const rolCompleto =
                        rAbv === "Admin"
                          ? "Administrador"
                          : rAbv === "Gestor"
                            ? "Gestor"
                            : "Almacenista";
                      const esElActual = item.rol === rolCompleto;
                      return (
                        <TouchableOpacity
                          key={rAbv}
                          style={[
                            styles.miniBotonRol,
                            esElActual && styles.miniBotonRolActivo,
                          ]}
                          onPress={() =>
                            cambiarRolAUser(item.nombre, rolCompleto)
                          }
                        >
                          <Text
                            style={[
                              styles.textoMiniBotonRol,
                              esElActual && styles.textoMiniBotonRolActivo,
                            ]}
                          >
                            {rAbv}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {rolUsuarioActual === "Administrador" && (
                <View style={styles.accionesUser}>
                  <TouchableOpacity
                    style={styles.botonReset}
                    onPress={() => resetearContrasena(item.nombre)}
                  >
                    <Text style={styles.textoBotonMini}>🔑 Reset</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.botonBorrar}
                    onPress={() => eliminarUsuario(item.nombre)}
                  >
                    <Text style={styles.textoBotonMini}>❌</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
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
    marginBottom: 12,
    borderBottomWidth: 1,
    borderColor: "#f1f2f6",
    paddingBottom: 5,
  },
  input: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#dcdde1",
    borderRadius: 6,
    padding: 10,
    fontSize: 15,
    marginBottom: 10,
  },
  botonPrimario: {
    backgroundColor: "#2c3e50",
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  textoBoton: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  etiqueta: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#7f8c8d",
    marginBottom: 6,
    marginTop: 5,
  },
  contenedorRoles: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
    gap: 5,
  },
  botonRol: {
    flex: 1,
    backgroundColor: "#f1f2f6",
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#dcdde1",
  },
  botonRolActivo: { backgroundColor: "#3498db", borderColor: "#2980b9" },
  textoRol: { fontSize: 11, fontWeight: "bold", color: "#7f8c8d" },
  textoRolActivo: { color: "#fff" },
  tarjetaUsuarioLista: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: "#f1f2f6",
  },
  infoUsuario: { flex: 1, paddingRight: 10 },
  nombreUser: { fontSize: 17, fontWeight: "bold", color: "#2c3e50" },
  rolUserText: {
    fontSize: 12,
    color: "#7f8c8d",
    marginTop: 2,
    marginBottom: 3,
  },
  zonaCambioRolRapido: { flexDirection: "row", gap: 4, marginTop: 5 },
  miniBotonRol: {
    backgroundColor: "#f1f2f6",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#dcdde1",
  },
  miniBotonRolActivo: { backgroundColor: "#9b59b6", borderColor: "#8e44ad" },
  textoMiniBotonRol: { fontSize: 10, fontWeight: "bold", color: "#7f8c8d" },
  textoMiniBotonRolActivo: { color: "#fff" },
  accionesUser: { flexDirection: "row", gap: 6, alignItems: "center" },
  botonReset: {
    backgroundColor: "#f39c12",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  botonBorrar: {
    backgroundColor: "#e74c3c",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  textoBotonMini: { color: "#fff", fontSize: 12, fontWeight: "bold" },
});
