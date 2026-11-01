import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface WebhookSubscription {
  id: number;
  customerId: number;
  eventType: string;
  targetUrl: string;
  isActive: boolean;
  createdAt: string;
}

export interface WebhookDelivery {
  id: number;
  eventType: string;
  status: 'pending' | 'delivered' | 'failed';
  responseStatus: number | null;
  attempts: number;
  createdAt: string;
}

export interface WebhookEventType {
  event: string;
  description: string;
}

@Injectable({ providedIn: 'root' })
export class WebhooksService {
  private base = `${environment.server.baseUrl}/api/webhooks`;

  constructor(private http: HttpClient) {}

  listSubscriptions(customerId?: number) {
    const params: any = {};
    if (customerId) params.customerId = customerId;
    return this.http.get<WebhookSubscription[]>(`${this.base}/subscriptions`, { params });
  }

  createSubscription(sub: { customerId: number; eventType: string; targetUrl: string; secret?: string }) {
    return this.http.post<{ id: number }>(`${this.base}/subscriptions`, sub);
  }

  deleteSubscription(id: number) {
    return this.http.delete<{ success: boolean }>(`${this.base}/subscriptions/${id}`);
  }

  getDeliveries(subscriptionId: number) {
    return this.http.get<WebhookDelivery[]>(`${this.base}/subscriptions/${subscriptionId}/deliveries`);
  }

  getEventTypes() {
    return this.http.get<WebhookEventType[]>(`${this.base}/event-types`);
  }
}
