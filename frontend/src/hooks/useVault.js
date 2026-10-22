import { useQuery } from '@tanstack/react-query';
import { get } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toClinic, toAppointment, toDocument } from '../context/DataContext';
import { vaultKeys } from './queryKeys';

// A pet's medical records vault: clinics, visits and documents, fetched
// together when the records screen opens. Adding, deleting, reading with the
// AI and applying a reading stay in DataContext, which write the answer into
// this cache or re-read it. The cache holds the server's lists as they came.
const fetchVault = async (petId) => {
  const [clinics, appointments, documents] = await Promise.all([
    get(`/pets/${petId}/clinics`),
    get(`/pets/${petId}/appointments`),
    get(`/pets/${petId}/documents`),
  ]);
  return { clinics, appointments, documents };
};

const toRecords = (data) => ({
  clinics: data.clinics.map(toClinic),
  appointments: data.appointments.map(toAppointment),
  documents: data.documents.map(toDocument),
});

export function useVaultQuery(petId) {
  const { user } = useAuth();
  return useQuery({
    queryKey: vaultKeys.pet(user?.id, petId),
    queryFn: () => fetchVault(petId),
    enabled: !!user && !!petId,
    select: toRecords,
  });
}
