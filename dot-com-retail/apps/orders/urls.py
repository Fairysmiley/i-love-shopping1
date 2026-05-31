from django.urls import path
from .views import (
    OrderListView,
    OrderDetailView,
    OrderCreateView,
    OrderCancelView,
    OrderRefundView,
    PaymentConfirmView,
    ShippingOptionsView,
    StripePublishableKeyView,
    StripeWebhookView
)

urlpatterns = [
    path('', OrderListView.as_view(), name='order-list'),
    path('<int:pk>/', OrderDetailView.as_view(), name='order-detail'),
    path('create/', OrderCreateView.as_view(), name='order-create'),
    path('<int:order_id>/cancel/', OrderCancelView.as_view(), name='order-cancel'),
    path('<int:order_id>/refund/', OrderRefundView.as_view(), name='order-refund'),
    path('shipping-options/', ShippingOptionsView.as_view(), name='shipping-options'),
    path('payment/confirm/', PaymentConfirmView.as_view(), name='payment-confirm'),
    path('payment/config/', StripePublishableKeyView.as_view(), name='stripe-config'),
    path('payment/webhook/', StripeWebhookView.as_view(), name='stripe-webhook'),
    path('webhook/', StripeWebhookView.as_view(), name='stripe-webhook-legacy'),  # Alias for tests
]
