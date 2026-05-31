from django.urls import path
from .views import (
    CartView,
    CartAddItemView,
    CartUpdateItemView,
    CartRemoveItemView,
    CartClearView
)

urlpatterns = [
    path('', CartView.as_view(), name='cart'),
    path('add/', CartAddItemView.as_view(), name='cart-add'),
    path('update/<int:item_id>/', CartUpdateItemView.as_view(), name='cart-update'),
    path('remove/<int:item_id>/', CartRemoveItemView.as_view(), name='cart-remove'),
    path('clear/', CartClearView.as_view(), name='cart-clear'),
]
