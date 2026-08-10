import { Injectable } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { ContactMessageDto } from './dto/contact.dto';

@Injectable()
export class ContactService {
  constructor(private readonly mail: MailService) {}

  async submit(dto: ContactMessageDto): Promise<void> {
    await this.mail.sendContactMessage(dto);
  }
}
