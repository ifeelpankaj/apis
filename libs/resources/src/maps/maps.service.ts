import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@app/core';
import { RideErrors } from '../rides/types/ride-errors.js';

export interface RouteResult {
  distance_km: number;
  duration_minutes: number;
}

@Injectable()
export class MapsService {
  constructor(private readonly config: AppConfigService) {}

  async getRoute(
    pickupLat: number,
    pickupLng: number,
    destLat: number,
    destLng: number,
    roundTrip: boolean,
    roundTripMultiplier: number,
  ): Promise<RouteResult> {
    const booking = this.config.booking;
    const url = `${booking.orsBaseUrl}/v2/directions/driving-car`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (booking.orsApiKey) {
      headers['Authorization'] = booking.orsApiKey;
    }

    const body = {
      coordinates: [
        [pickupLng, pickupLat],
        [destLng, destLat],
      ],
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw RideErrors.mapsFailed();
      }

      const data = (await response.json()) as {
        routes?: Array<{ summary?: { distance?: number; duration?: number } }>;
      };

      const summary = data.routes?.[0]?.summary;
      if (!summary?.distance || summary.duration == null) {
        throw RideErrors.mapsFailed();
      }

      let distanceKm = summary.distance / 1000;
      let durationMinutes = Math.ceil(summary.duration / 60);

      if (roundTrip) {
        distanceKm *= roundTripMultiplier;
        durationMinutes = Math.ceil(durationMinutes * roundTripMultiplier);
      }

      return {
        distance_km: Math.round(distanceKm * 100) / 100,
        duration_minutes: durationMinutes,
      };
    } catch (error) {
      if (error instanceof Error && 'errorCode' in error) {
        throw error;
      }
      throw RideErrors.mapsFailed();
    }
  }
}
