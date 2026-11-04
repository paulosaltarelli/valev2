import { Test, TestingModule } from '@nestjs/testing';
import { DashService } from './dash.service';

describe('DashService', () => {
  let service: DashService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DashService],
    }).compile();

    service = module.get<DashService>(DashService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
