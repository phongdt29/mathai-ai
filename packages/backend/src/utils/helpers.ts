import { StudentProfileRepository } from '../models/student.model';
import { NotFoundError } from './errors';

const studentProfileRepo = new StudentProfileRepository();

export async function getStudentProfileId(userId: string): Promise<string> {
  const profile = await studentProfileRepo.findByUserId(userId);

  if (!profile) {
    throw new NotFoundError('Student profile not found');
  }

  return (profile as any)._id?.toString() ?? (profile as any).id;
}

export async function getStudentProfile(userId: string) {
  const profile = await studentProfileRepo.findByUserId(userId);

  if (!profile) {
    throw new NotFoundError('Student profile not found');
  }

  return profile;
}
