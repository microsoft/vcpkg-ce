// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.


import { defaultClient, DistributedTracingModes, setup } from 'applicationinsights';
import { version } from 'os';

process.env['APPLICATION_INSIGHTS_NO_STATSBEAT'] = 'true';
export const insights = setup('b4e88960-4393-4dd9-ab8e-97e8fe6d7603').
  setAutoCollectConsole(false).
  setAutoCollectDependencies(false).
  setAutoCollectExceptions(false).
  setAutoCollectHeartbeat(false).
  setAutoCollectPerformance(false).
  setAutoCollectPreAggregatedMetrics(false).
  setAutoCollectRequests(false).
  setAutoDependencyCorrelation(false).
  setDistributedTracingMode(DistributedTracingModes.AI).
  setInternalLogging(false).
  setSendLiveMetrics(false).
  setUseDiskRetryCaching(false).
  start();
export function trackEvent(name: string, properties?: { [key: string]: string }) {
  defaultClient.trackEvent({
    name: 'Microsoft.ApplicationInsights.Event',
    tagOverrides: {
      'ai.device.os': process.platform,
      'ai.device.osVersion': version(),
    },
    properties: {
      ...properties,
      'from': 'vcpkg-ce'
    }


  });
}