import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { BaseRepository } from '@app/core';
import {
  countActiveVehiclesByProfileId,
  createVehicle,
  getVehicleById,
  listVehiclesByProfileId,
  type ICreateVehicleParams,
} from '@db/queries/drivers/vehicles.queries.js';

@Injectable()
export class VehicleRepository extends BaseRepository {
  async create(params: ICreateVehicleParams, client?: PoolClient) {
    const connection = client ?? this.pool;
    const [row] = await createVehicle.run(params, connection);
    if (!row) {
      throw new Error('Failed to create vehicle');
    }
    return row;
  }

  async listByProfileId(driverProfileId: string, client?: PoolClient) {
    const connection = client ?? this.pool;
    return listVehiclesByProfileId.run({ driverProfileId }, connection);
  }

  async findById(id: string, client?: PoolClient) {
    const connection = client ?? this.pool;
    const [row] = await getVehicleById.run({ id }, connection);
    return row ?? null;
  }

  async countActiveByProfileId(driverProfileId: string, client?: PoolClient) {
    const connection = client ?? this.pool;
    const [row] = await countActiveVehiclesByProfileId.run({ driverProfileId }, connection);
    return row?.count ?? 0;
  }
}
