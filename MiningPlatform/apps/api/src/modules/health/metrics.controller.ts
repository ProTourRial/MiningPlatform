import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller({ path: 'metrics', version: '1' })
export class MetricsController {
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics() {
    const memory = process.memoryUsage();
    return [
      '# HELP mining_api_process_uptime_seconds API process uptime.',
      '# TYPE mining_api_process_uptime_seconds gauge',
      `mining_api_process_uptime_seconds ${process.uptime()}`,
      '# HELP mining_api_process_resident_memory_bytes API resident memory.',
      '# TYPE mining_api_process_resident_memory_bytes gauge',
      `mining_api_process_resident_memory_bytes ${memory.rss}`,
      '# HELP mining_api_build_info Static build information.',
      '# TYPE mining_api_build_info gauge',
      'mining_api_build_info{version="0.2.0-alpha.2"} 1',
      '',
    ].join('\n');
  }
}
