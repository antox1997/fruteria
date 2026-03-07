import { supabase } from './supabase.js';

// Helper para obtener el ID del usuario actual
const getUserId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id;
};

export const fetchData = async (entity) => {
  const userId = await getUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from(entity)
    .select('*')
    .eq('perfil_id', userId);

  if (error) {
    console.error(`Error fetching ${entity}:`, error);
    return [];
  }
  return data;
};

export const addData = async (entity, data) => {
  const userId = await getUserId();
  if (!userId) throw new Error("No hay sesión activa");

  const { data: result, error } = await supabase
    .from(entity)
    .insert([{ ...data, perfil_id: userId }])
    .select()
    .single();

  if (error) throw error;
  return result;
};

export const updateData = async (entity, id, data) => {
  const userId = await getUserId();
  const { data: result, error } = await supabase
    .from(entity)
    .update(data)
    .eq('id', id)
    .eq('perfil_id', userId)
    .select()
    .single();

  if (error) throw error;
  return result;
};

export const deleteData = async (entity, id) => {
  const userId = await getUserId();
  const { error } = await supabase
    .from(entity)
    .delete()
    .eq('id', id)
    .eq('perfil_id', userId);

  if (error) throw error;
  return true;
};
