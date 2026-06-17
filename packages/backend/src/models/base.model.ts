import mongoose, { Schema, Model, Document, FilterQuery, UpdateQuery, ClientSession } from 'mongoose';
import { SortOrder } from '../types';
import { NotFoundError } from '../utils/errors';

export interface RepositoryPaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class BaseRepository<T extends Document> {
  public readonly model: Model<T>;

  constructor(model: Model<T>) {
    this.model = model;
  }

  public async findById(id: string, session?: ClientSession): Promise<T | null> {
    return this.model.findById(id).session(session ?? null).exec();
  }

  public async findOne(conditions: FilterQuery<T>, session?: ClientSession): Promise<T | null> {
    return this.model.findOne(conditions).session(session ?? null).exec();
  }

  public async findAll(conditions?: FilterQuery<T>, session?: ClientSession): Promise<T[]> {
    return this.model.find(conditions ?? {}).session(session ?? null).exec();
  }

  public async findWithPagination(
    conditions: FilterQuery<T> = {},
    page: number = 1,
    limit: number = 10,
    orderBy: string = 'createdAt',
    order: SortOrder = 'desc',
    session?: ClientSession
  ): Promise<RepositoryPaginationResult<T>> {
    const currentPage = page > 0 ? page : 1;
    const perPage = limit > 0 ? limit : 10;
    const offset = (currentPage - 1) * perPage;

    const sortDir = order === 'asc' ? 1 : -1;

    const [total, data] = await Promise.all([
      this.model.countDocuments(conditions).session(session ?? null).exec(),
      this.model
        .find(conditions)
        .session(session ?? null)
        .sort({ [orderBy]: sortDir })
        .skip(offset)
        .limit(perPage)
        .exec(),
    ]);

    return {
      data,
      total,
      page: currentPage,
      limit: perPage,
      totalPages: perPage > 0 ? Math.ceil(total / perPage) : 0,
    };
  }

  public async create(data: Partial<T>, session?: ClientSession): Promise<T> {
    const [doc] = await this.model.create([data], { session: session ?? undefined });
    return doc as T;
  }

  public async update(id: string, data: Partial<T>, session?: ClientSession): Promise<T> {
    const updated = await this.model
      .findByIdAndUpdate(id, { $set: data } as UpdateQuery<T>, { new: true, session: session ?? undefined })
      .exec();

    if (!updated) {
      throw new NotFoundError(`Không tìm thấy bản ghi ${id}`);
    }

    return updated;
  }

  public async delete(id: string, session?: ClientSession): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id, { session: session ?? undefined }).exec();
    return result !== null;
  }

  public async transaction<R>(callback: (session: ClientSession) => Promise<R>): Promise<R> {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const result = await callback(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}

export { Schema, Model, Document, mongoose };
export default BaseRepository;
