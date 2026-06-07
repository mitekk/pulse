import { Module } from '@nestjs/common';
import { MinioStorageService } from './minio-storage.service';
import { STORAGE_PORT } from './storage.port';

@Module({
  providers: [
    MinioStorageService,
    {
      provide: STORAGE_PORT,
      useExisting: MinioStorageService,
    },
  ],
  exports: [STORAGE_PORT, MinioStorageService],
})
export class StorageModule {}
