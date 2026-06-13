import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('artifacts')
export class ArtifactEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ nullable: true, type: 'text' })
  conversationId?: string;

  @Column({ nullable: true, type: 'text' })
  messageId?: string;

  @Column({ nullable: true, type: 'text' })
  type?: string;

  @Column({ nullable: true, type: 'text' })
  kind?: string;

  @Column({ nullable: true, type: 'text' })
  title?: string;

  @Column({ nullable: true, type: 'text' })
  status?: string;

  @Column({ nullable: true, type: 'text' })
  renderMode?: string;

  @Column({ nullable: true, type: 'text' })
  summary?: string;

  @Column({ nullable: true, type: 'text' })
  payloadPath?: string;

  @Column({ nullable: true, type: 'text' })
  url?: string;

  @Column({ nullable: true, type: 'text' })
  storagePath?: string;

  @Column({ nullable: true, type: 'text' })
  mimeType?: string;

  @Column({ nullable: true, type: 'integer' })
  sizeBytes?: number;

  @Column({ nullable: true, type: 'text' })
  metadataJson?: string;

  @Column({ nullable: true })
  createdAt?: Date;
}
