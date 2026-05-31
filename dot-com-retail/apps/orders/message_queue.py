import pika
import json
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


def get_rabbitmq_connection():
    """
    create rabbitmq connection
    """
    try:
        credentials = pika.PlainCredentials(
            settings.RABBITMQ_USER,
            settings.RABBITMQ_PASSWORD
        )
        parameters = pika.ConnectionParameters(
            host=settings.RABBITMQ_HOST,
            port=settings.RABBITMQ_PORT,
            credentials=credentials,
            heartbeat=600,
            blocked_connection_timeout=300
        )
        return pika.BlockingConnection(parameters)
    except Exception as e:
        logger.error(f"failed to connect to rabbitmq: {e}")
        return None


def publish_payment_status(order_id, payment_status, payment_id=None, error_message=None):
    """
    publish payment status update to queue
    """
    connection = get_rabbitmq_connection()
    if not connection:
        logger.error("could not publish payment status - no connection")
        return False
    
    try:
        channel = connection.channel()
        
        # declare dead letter exchange and queue
        channel.exchange_declare(exchange='payment_status_dlx', exchange_type='direct', durable=True)
        channel.queue_declare(queue='payment_status_dlq', durable=True)
        channel.queue_bind(exchange='payment_status_dlx', queue='payment_status_dlq', routing_key='payment_status')
        
        # declare main queue with DLX
        channel.queue_declare(
            queue='payment_status',
            durable=True,
            arguments={
                'x-dead-letter-exchange': 'payment_status_dlx',
                'x-dead-letter-routing-key': 'payment_status'
            }
        )
        
        # create message
        message = {
            'order_id': order_id,
            'status': payment_status,
            'payment_id': payment_id,
            'error_message': error_message
        }
        
        # publish message
        channel.basic_publish(
            exchange='',
            routing_key='payment_status',
            body=json.dumps(message),
            properties=pika.BasicProperties(
                delivery_mode=2,  # make message persistent
            )
        )
        
        logger.info(f"published payment status for order {order_id}: {payment_status}")
        return True
    except Exception as e:
        logger.error(f"failed to publish payment status: {e}")
        return False
    finally:
        if connection:
            connection.close()


def consume_payment_status(callback):
    """
    consume payment status updates from queue
    callback should be a function that takes (order_id, status, payment_id, error_message)
    """
    connection = get_rabbitmq_connection()
    if not connection:
        logger.error("could not start consumer - no connection")
        return
    
    try:
        channel = connection.channel()
        
        # declare dead letter exchange and queue
        channel.exchange_declare(exchange='payment_status_dlx', exchange_type='direct', durable=True)
        channel.queue_declare(queue='payment_status_dlq', durable=True)
        channel.queue_bind(exchange='payment_status_dlx', queue='payment_status_dlq', routing_key='payment_status')
        
        # declare main queue with DLX
        channel.queue_declare(
            queue='payment_status',
            durable=True,
            arguments={
                'x-dead-letter-exchange': 'payment_status_dlx',
                'x-dead-letter-routing-key': 'payment_status'
            }
        )
        
        def on_message(ch, method, properties, body):
            try:
                message = json.loads(body)
                callback(
                    message['order_id'],
                    message['status'],
                    message.get('payment_id'),
                    message.get('error_message')
                )
                ch.basic_ack(delivery_tag=method.delivery_tag)
            except Exception as e:
                logger.error(f"error processing message: {e}")
                # message will be sent to DLQ after max retries
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        
        channel.basic_qos(prefetch_count=1)
        channel.basic_consume(queue='payment_status', on_message_callback=on_message)
        
        logger.info("started consuming payment status updates (DLQ configured)")
        channel.start_consuming()
    except Exception as e:
        logger.error(f"error in consumer: {e}")
    finally:
        if connection:
            connection.close()
