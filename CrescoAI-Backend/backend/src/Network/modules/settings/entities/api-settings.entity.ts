import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('api_settings')
export class ApiSettingsEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer', unique: true })
  userId!: number;

  @Column({ type: 'text', default: 'anthropic' })
  provider!: string;

  @Column({ type: 'text', nullable: true })
  apiKey?: string;

  @Column({ type: 'text', nullable: true })
  baseUrl?: string;

  @Column({ type: 'text', nullable: true })
  model?: string;

  // Multimodal: image generation
  @Column({ type: 'text', nullable: true })
  imageUrl?: string;

  @Column({ type: 'text', nullable: true })
  imageKey?: string;

  @Column({ type: 'text', nullable: true })
  imageDefaultModel?: string;

  @Column({ type: 'text', nullable: true })
  imageModels?: string; // JSON array string

  // Multimodal: video generation
  @Column({ type: 'text', nullable: true })
  videoUrl?: string;

  @Column({ type: 'text', nullable: true })
  videoKey?: string;

  @Column({ type: 'text', nullable: true })
  videoDefaultModel?: string;

  @Column({ type: 'text', nullable: true })
  videoModels?: string; // JSON array string

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
