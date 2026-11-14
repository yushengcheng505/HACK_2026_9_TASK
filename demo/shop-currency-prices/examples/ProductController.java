// Пример текущей выдачи карточки товара в catalogservice («Полка»).
package ru.polka.catalog;

import org.springframework.web.bind.annotation.*;

@RestController
public class ProductController {
    private final ProductCache cache;
    private final ProductRepository repository;

    public ProductController(ProductCache cache, ProductRepository repository) {
        this.cache = cache;
        this.repository = repository;
    }

    @GetMapping("/products/{id}")
    public Product getProduct(@PathVariable String id) {
        return cache.get(id).orElseGet(() -> {
            Product product = repository.findById(id).orElseThrow(NotFoundException::new);
            cache.put(product);
            return product;
        });
    }
}
